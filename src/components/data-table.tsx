'use client'

import { searchShipments } from '@/actions/search-shipments'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  'use no memo'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sorting, setSorting] = useState<SortingState>([])
  const [tableData, setTableData] = useState<TData[]>(data)
  const [loading, setLoading] = useState(false)
  const latestSearchRequestRef = useRef(0)

  useEffect(() => {
    setTableData(data)
  }, [data])

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

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

  return (
    <div>
      <div className='mb-4 flex items-center gap-3'>
        <input
          type='text'
          placeholder='Search by item...'
          onChange={handleSearch}
          className='flex h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
        />
        {loading && (
          <div className='h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent' />
        )}
      </div>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className='cursor-pointer select-none'
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {header.column.getIsSorted() === 'asc' && ' ↑'}
                    {header.column.getIsSorted() === 'desc' && ' ↓'}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center text-muted-foreground'
                >
                  No Data Found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
