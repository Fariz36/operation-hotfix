'use client'

import { updateShipmentStatus } from '@/actions/update-status'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Shipment } from '@/types/shipment'
import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'

export const columns: ColumnDef<Shipment>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => (
      <span className='font-mono text-xs text-muted-foreground'>
        {row.getValue<string>('id').slice(0, 8)}…
      </span>
    ),
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => {
      const date = new Date(row.getValue<string>('created_at'))
      return <span className='text-sm'>{date.toLocaleDateString()}</span>
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.getValue('status')} />,
  },
  {
    accessorKey: 'cargo_details',
    header: 'Cargo',
    cell: ({ row }) => {
      const cargo = row.getValue<Shipment['cargo_details']>('cargo_details')
      if (!cargo)
        return <span className='text-sm text-muted-foreground'>—</span>
      return (
        <div className='text-sm'>
          <p className='font-medium'>{cargo.item}</p>
          <p className='text-muted-foreground'>{cargo.weight_kg} kg</p>
        </div>
      )
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const shipment = row.original

      const handleStatusUpdate = async (status: string) => {
        const result = await updateShipmentStatus(shipment.id, status)
        if (result.success) {
          toast.success('Status updated successfully')
        } else {
          toast.error(result.error || 'Failed to update status')
        }
      }

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' className='h-8 w-8 p-0'>
              <span className='sr-only'>Open menu</span>
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuLabel>Update Status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleStatusUpdate('Pending')}>
              Pending
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusUpdate('In Transit')}>
              In Transit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusUpdate('Delivered')}>
              Delivered
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
