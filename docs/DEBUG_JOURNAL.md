# Debug Journal

Complete one entry per bug. All six entries are required for full marks.

---

## Bug 1 — Silent RLS Block

Investigation : 
1. Checked browser console → no error
2. Checked network tab → Supabase returned 200 with empty array
3. Verified database → 5 rows exist
4. Confirmed RLS enabled on shipments table
5. Checked policies → no SELECT policy for anon

| Field          | Your Entry |
| -------------- | ---------- |
| **Symptom**    | Dashboard renders `No Data Found` even though Supabase table has 5 rows; no browser error appears. |
| **Hypothesis** | `shipments` has RLS enabled but no `SELECT` policy for the `anon` role, so Supabase returns an empty result set instead of throwing a visible frontend error. |
| **AI Prompt**  | i have a bug on the system. the data on page `dashboard` is empty (shows No Data Found), eventhought i've checked the database in supabase, it have 5 rows. i believe the query is already correct, so the problem may lie on the supabase setup itself. i believe that is because the RLS doesnt allow select. please read the file ```legacy_setup.sql```. Check and please make a safe and production-ready fix for that bug. 
| **Fix**        | Added a dedicated SELECT policy in `legacy_setup.sql`: `Allow anon read valid shipment statuses` with `TO anon USING (status IN ('Pending', 'In Transit', 'Delivered'))`. This restores table visibility while avoiding disallowed `USING (true)` for reads. |

---

## Bug 2 — Ghost Mutation

Investigation : 
1. retry the bug (reproduceable)
2. the log shows POST /dashboard 200 in 154ms (compile: 8ms, render: 146ms)
3. the result from network request also success, there's no weird message. it also contain what is posted to the supabase (["3bc08cce-d48c-4f21-9482-33143bdb5464", "Delivered"], but the status is not updated, still pending. so i believe its not about the false request sent), 
4. start checking whats being called when perform edit on the /dashboard
5. start inspecting `update-status.ts` implementation.
6. The Supabase update query doesnt have `await` clause, meaning the function may complete before the mutation finishes.
7. The UI triggers revalidation immediately, so the page reloads before the DB update commits.


| Field          | Your Entry |
| -------------- | ---------- |
| **Symptom**    | Every status change showed a success toast, but after refresh the status always reverted to its original value. |
| **Hypothesis** | After checking the edit logic, its call toast and update-status. I believe toast is safe, so the only thing remain is the update-status. |
| **AI Prompt**  | No AI prompt. but if i need to prompt ai, it will be something like "i have a bug in the system, when i perform status change on the page /dashboard, it showed a success toast, but after refresh the status always reverted to its original value. the changes is not applied to the database. the log show the log shows POST /dashboard 200 in 154ms (compile: 8ms, render: 146ms), the result from network request also success, there's no weird message. it also contain what is posted to the supabase (["3bc08cce-d48c-4f21-9482-33143bdb5464", "Delivered"], but the status is not updated, still pending. Payload contains the correct shipment id and status. Therefore the request itself is correct and the issue likely occurs during the database update.). try to check the corresponding logic on these file (insert `column.tsx` and `update-status.ts`) and make safe and production-ready fix for that bug" |
| **Fix**        | Updated `updateShipmentStatus` to `await` the update query, check `error`, and return `{ success: false, error }` on failure. Revalidation now runs only after a successful DB update. |

---

## Bug 3 — Infinite Loop

Investigation : 
1. retry the bug (reproduceable) by just opening `/dashboard`
2. server terminal flooded with repeated `GET /dashboard` requests even without clicking anything. the logs show alot of GET /dashboard request

```
GET /dashboard 200 in 113ms (compile: 2ms, render: 111ms)
GET /dashboard 200 in 77ms (compile: 2ms, render: 75ms)
GET /dashboard 200 in 95ms (compile: 2ms, render: 92ms)
GET /dashboard 200 in 79ms (compile: 3ms, render: 76ms)
GET /dashboard 200 in 115ms (compile: 2ms, render: 113ms)
```

3. the network request shows a lot of get /dashborad request but with some params. 

```
http://localhost:3000/dashboard?_rsc=1h1b5
http://localhost:3000/dashboard?_rsc=1h1b5
http://localhost:3000/dashboard?_rsc=1h1b5
http://localhost:3000/dashboard?_rsc=1h1b5
http://localhost:3000/dashboard?_rsc=1h1b5
http://localhost:3000/dashboard?_rsc=1h1b5
```

around 10 of it is happening in a single second.
3. start checking what call the get request (ctrl + shift + f, search for `/dashboard`. The most sus one is `data-table.tsx`)
4. started checking logic in `data-table.tsx`
5. found URL sync `useEffect` for sorting, and it runs `router.push` on every effect run

| Field          | Your Entry |
| -------------- | ---------- |
| **Symptom**    | Dashboard freezes on load and server receives continuous `GET /dashboard` requests. |
| **Hypothesis** | The sorting sync effect keeps pushing route updates because of unstable dependency, unconditional `router.push`, causing an infinite rerender/navigation cycle. |
| **AI Prompt**  | i have a in the system `/dashboard` keeps reloading and server gets a lot of GET requests per second without user interaction. here's the server logs and the network request logs `insert the logs`. please inspect `data-table.tsx`, especially the `useEffect` that syncs sorting to query params and its dependency array. identify why it loops and suggest a safe, minimal, and production-safe fix." |
| **Fix**        | Replaced effect dependency with stable `sorting` state and added a guard: only call `router.push` when computed query params differ from current params. This removes the loop while keeping URL sort sync. |

**Before** : 
```
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (sorting.length > 0) {
      params.set('sort', sorting[0].id)
      params.set('desc', String(sorting[0].desc))
    } else {
      params.delete('sort')
      params.delete('desc')
    }
    router.push(`/dashboard?${params.toString()}`)
  }, [table.getState().sorting, searchParams, router])
```

**After** : 
```
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (sorting.length > 0) {
      params.set('sort', sorting[0].id)
      params.set('desc', String(sorting[0].desc))
    } else {
      params.delete('sort')
      params.delete('desc')
    }

    const nextQuery = params.toString()
    const currentQuery = searchParams.toString()

    if (nextQuery !== currentQuery) {
      router.push(nextQuery ? `/dashboard?${nextQuery}` : '/dashboard')
    }
  }, [sorting, searchParams, router])
```

---

## Bug 4 — The Invisible Cargo

Investigation : 
1. retry the bug. table rows are visible but cargo column mostly blank
2. checked the database content, and its exist on the database. with the format like this
```
[
  {
    "item": "Electronic Components",
    "weight_kg": 67
  }
]
```
3. inspected cargo cell renderer in `columns.tsx`; it reads `cargo.item` and `cargo.weight_kg` (expects object shape)
4. checked type file `shipment.ts`; it declares `cargo_details` as object or null, but this is only TS expectation, not runtime guarantee
5. found existing helper `normalizeCargoDetails` that converts array payload into first object
6. search action already applies normalization, but initial `/dashboard` load in `page.tsx` was passing raw Supabase data directly
7. normalize cargo on dashboard fetch path before sending rows to `DataTable`

| Field          | Your Entry |
| -------------- | ---------- |
| **Symptom**    | Cargo column is blank for most rows even though cargo data exists; only the null-cargo row correctly shows `—`. |
| **Hypothesis** | Supabase returns `cargo_details` mostly as JSON array, while UI cell expects single object. Accessing `cargo.item` on array gives undefined, resulting in blank render. |
| **AI Prompt**  | i have bug on `/dashboard`: rows are visible but cargo column is blank for most rows. db data exists. it should shows all the column correctly. in `legacy_setup.sql` cargo is seeded as JSON array, here's the example of a row (insert the `legacy_setup.sql`). in `columns.tsx` cell reads `cargo.item` and `cargo.weight_kg`. can you inspect `page.tsx`, `columns.tsx`, and `normalizeCargoDetails.ts` and provide a minimal safe fix so cargo renders correctly on initial load too? |
| **Fix**        | Updated dashboard fetch mapping in `src/app/dashboard/page.tsx` to normalize `cargo_details` with `normalizeCargoDetails` before passing data into `DataTable`. This aligns runtime payload with UI expectation and keeps null rows as `—`. |

**Before** : 
```
  const { data: shipments } = await supabase.from('shipments').select('*')
  <DataTable columns={columns} data={(shipments ?? []) as Shipment[]} />
```

**After** : 
```
  const { data: shipments } = await supabase.from('shipments').select('*')
  const normalizedShipments = (shipments ?? []).map((shipment) => ({
    ...shipment,
    cargo_details: normalizeCargoDetails(shipment.cargo_details),
  })) as Shipment[]
  <DataTable columns={columns} data={normalizedShipments} />
```

---

## Bug 5 — The Unreliable Search

Investigation : 
1. reproduce bug by typing quickly in search input (`Medical` then immediately `Electronics`)
2. enabled slow network throttle and observed wrong result order happens more often
3. checked `data-table.tsx` search handler: every keypress sends async `searchShipments(query)` without cancellation or stale-response check
4. if older request resolves after newer request, old result still calls `setTableData`, overriding latest query results
5. fix should ensure only latest request is allowed to update table/loading state

| Field          | Your Entry |
| -------------- | ---------- |
| **Symptom**    | Search results become inconsistent when typing quickly; table can show results for previous input instead of current input. |
| **Hypothesis** | Search requests resolve out of order under latency. Because every response updates state unconditionally, stale responses overwrite the latest query result. |
| **AI Prompt**  | i have bug on `/dashboard` search input. when typing fast (especially on slow network), the table shows results that dont match current text. please inspect `data-table.tsx` `handleSearch` async flow and provide a minimal, production-safe fix so only the latest query response can update the table. |
| **Fix**        | Added a request sequence guard in `handleSearch` using `useRef`. Each search gets a request id, and only the newest request id can update `tableData` and `loading`. This prevents stale responses from overriding current results. |

**Before** : 
```
  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setLoading(true)
    const results = await searchShipments(query)
    setTableData(results as TData[])
    setLoading(false)
  }
```

**After** : 
```
  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    const requestId = ++latestSearchRequestRef.current

    setLoading(true)
    try {
      const results = await searchShipments(query)
      if (requestId === latestSearchRequestRef.current) {
        setTableData(results as TData[])
      }
    } finally {
      if (requestId === latestSearchRequestRef.current) {
        setLoading(false)
      }
    }
  }
```

---

## Bug 6 — The Persistent Ghost

Investigation : 
1. retry bug by selecting a row with `Delivered` status and changing it to `Pending`
2. UI showed success toast, but after refresh status remained `Delivered`
3. checked DB setup in `legacy_setup.sql`, found trigger `prevent_delivered_to_pending()` that intentionally blocks this transition
4. this means app should not show success for this case; it should surface DB error clearly
5. inspected `update-status.ts`, found action always returned `{ success: true }` and did not propagate Supabase error
6. inspected `columns.tsx`, found UI only had success toast and no error toast branch
7. fix needed: return failure from action when trigger rejects update, and show explicit error toast in UI

| Field          | Your Entry |
| -------------- | ---------- |
| **Symptom**    | Changing a shipment from `Delivered` to `Pending` shows success toast, but data never changes after refresh. |
| **Hypothesis** | Database trigger correctly rejects `Delivered -> Pending`, but application layer masks the error and still reports success. |
| **AI Prompt**  | i have bug on `/dashboard`: changing status from `Delivered` to `Pending` shows success toast but data doesnt persist after refresh. please inspect `legacy_setup.sql` (trigger/business rule), `update-status.ts`, and `columns.tsx`. i need a minimal production-safe fix where this transition either succeeds or shows a clear error toast, never false success. |
| **Fix**        | Updated `updateShipmentStatus` to await update and return `{ success: false, error }` when Supabase returns error. Updated `handleStatusUpdate` in `columns.tsx` to show `toast.error(...)` on failure. Delivered -> Pending now surfaces a clear error instead of false success. |

**Before** : 
```
  supabase.from('shipments').update({ status }).eq('id', id)
  revalidatePath('/dashboard')
  return { success: true }
```

```
  if (result.success) {
    toast.success('Status updated successfully')
  }
```

**After** : 
```
  const { error } = await supabase
    .from('shipments')
    .update({ status })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
```

```
  if (result.success) {
    toast.success('Status updated successfully')
  } else {
    toast.error(result.error || 'Failed to update status')
  }
```
