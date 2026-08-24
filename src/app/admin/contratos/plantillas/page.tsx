import { redirect } from 'next/navigation'

// El listado de plantillas vive dentro de la pestaña "Plantillas" de Contratos
export default function PlantillasPage() {
  redirect('/admin/contratos?tab=plantillas')
}
