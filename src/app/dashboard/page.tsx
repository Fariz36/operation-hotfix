import { columns } from '@/components/columns'
import { DataTable } from '@/components/data-table'
import { supabase } from '@/lib/supabase'
import type { Shipment } from '@/types/shipment'
import { normalizeCargoDetails } from '@/utils/normalizeCargoDetails'

export default async function DashboardPage() {
  const { data: shipments } = await supabase.from('shipments').select('*')
  const normalizedShipments = (shipments ?? []).map((shipment) => ({
    ...shipment,
    cargo_details: normalizeCargoDetails(shipment.cargo_details),
  })) as Shipment[]

  return (
    <div className='container mx-auto py-10 px-4'>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold tracking-tight'>Shipments</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          Manage and track all active logistics shipments.
        </p>
      </div>
      <DataTable columns={columns} data={normalizedShipments} />
    </div>
  )
}
