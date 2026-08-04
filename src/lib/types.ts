export type UserRole = 'admin' | 'investor' | 'vendedor'
export type ClientType = 'investor' | 'borrower' | 'both'

export interface Profile {
  id: string
  full_name: string
  cuit: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  role: UserRole
  client_type: ClientType
  trust_level: number // 0–5, pasos de 0.5
  created_at: string
  credit_scoring_report?: string | null
  credit_scoring_recommendation?: string | null
  credit_scoring_limit?: number | null
  cost_of_living?: number | null
  bcra_raw_report?: string | null
  credit_scoring_updated_at?: string | null
}

// ──────────────────────────────────────────
// ACTIVOS
// ──────────────────────────────────────────
export type AssetType = 'pesos' | 'dolares' | 'vehiculo' | 'inmueble' | 'otro'
export type AssetStatus = 'pendiente' | 'tasado' | 'vendido' | 'financiado'

export interface AssetValuation {
  id: string
  client_id: string
  asset_type: AssetType
  description: string
  market_value: number
  status: AssetStatus
  created_at: string
  currency?: Currency
  valuation_details?: any
}

export type AvailableAssetStatus = 'disponible' | 'reservado' | 'vendido'

export interface AssetAvailable {
  id: string
  asset_valuation_id: string | null
  title: string
  description: string | null
  asset_type: AssetType
  listed_value: number
  currency: Currency
  status: AvailableAssetStatus
  created_at: string
}

// ──────────────────────────────────────────
// CONTRATOS DE INVERSIÓN
// ──────────────────────────────────────────
export type ContractStatus =
  | 'borrador'
  | 'enviado'
  | 'pendiente_fondos'
  | 'en_consignacion'
  | 'activo'
  | 'retiro_solicitado'
  | 'retirado'
  | 'reinvertido'
  | 'vencido'

export type Currency = 'ARS' | 'USD'

export interface Contract {
  id: string
  client_id: string
  asset_id: string | null
  initial_capital: number
  current_capital: number | null
  currency: Currency
  monthly_rate: number
  start_date: string
  end_date: string
  status: ContractStatus
  sign_token: string | null
  contract_signed_at: string | null
  signer_ip: string | null
  contract_hash: string | null
  contract_pdf_url: string | null
  contract_url: string | null
  template_id: string | null
  withdrawal_requested_at: string | null
  withdrawal_confirmed_at: string | null
  created_at: string
  // Consignment fields
  consignacion_dias?: number | null
  consignacion_inicio?: string | null
  consignacion_fin?: string | null
  // Detailed withdrawal fields
  withdrawal_requested_amount?: number | null
  withdrawal_type?: 'total' | 'parcial_porcentaje' | 'parcial_monto' | null
  withdrawal_requested_percentage?: number | null
  // Joined
  profiles?: Profile
  assets_valuation?: AssetValuation
}

export type ContractEventType =
  | 'generated'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'withdrawal_requested'
  | 'withdrawal_confirmed'
  | 'pdf_downloaded'
  | 'funds_confirmed'

export interface ContractEvent {
  id: string
  contract_id: string
  event_type: ContractEventType
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ──────────────────────────────────────────
// PLANTILLAS DE CONTRATOS
// ──────────────────────────────────────────
export type TemplateType = 'inversion' | 'credito' | 'servicio' | 'otro'

export interface ContractTemplate {
  id: string
  name: string
  type: TemplateType
  content: string // HTML con {{placeholders}}
  variables: string[]
  is_active: boolean
  version: number
  created_at: string
}

// ──────────────────────────────────────────
// CRÉDITOS
// ──────────────────────────────────────────
export type CreditStatus = 'vigente' | 'finalizado' | 'moroso'

/**
 * Modalidad de devolución del crédito:
 * - `fija`: cuotas iguales (tasa = interés total sobre el capital)
 * - `decreciente`: sistema alemán, la cuota baja mes a mes (tasa mensual sobre el saldo)
 * - `refinanciacion`: el cliente paga solo el interés hasta cancelar el capital
 */
export type CreditType = 'fija' | 'decreciente' | 'refinanciacion'

export interface Credit {
  id: string
  client_id: string
  total_amount: number
  interest_rate: number
  total_installments: number
  currency: Currency
  description: string | null
  start_date: string | null
  status: CreditStatus
  contract_id: string | null
  daily_late_interest_rate: number
  created_at: string
  credit_type: CreditType
  first_due_date?: string | null
  payment_day?: number | null
  payoff_amount?: number | null
  payoff_at?: string | null
  // Joined
  profiles?: Profile
  credit_installments?: CreditInstallment[]
  guarantors?: Guarantor[]
}

export type InstallmentStatus = 'pendiente' | 'pagado' | 'vencido'

export interface CreditInstallment {
  id: string
  credit_id: string
  installment_number: number
  amount: number
  due_date: string
  status: InstallmentStatus
  paid_at: string | null
  late_interest: number
  created_at: string
  principal_amount?: number | null
  interest_amount?: number | null
  /** Cuota que solo cubre interés (refinanciación constante) */
  is_interest_only?: boolean
  /** Cuota de cancelación total del capital + interés */
  is_payoff?: boolean
  paid_amount?: number | null
}

export interface Guarantor {
  id: string
  credit_id: string
  full_name: string
  dni: string
  phone: string | null
  email: string | null
  relationship: string | null
  created_at: string
}

// ──────────────────────────────────────────
// DASHBOARD KPIs
// ──────────────────────────────────────────
export interface DashboardKPIs {
  liquidezARS: number
  liquidezUSD: number
  inversionesActivas: number
  proximosVencimientos: number
  totalCreditos: number
  porcentajeMorosidad: number
  totalClientes: number
  retirosEnEspera: number
}
