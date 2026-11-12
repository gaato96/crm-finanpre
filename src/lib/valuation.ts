export interface VehicleDetails {
  brandModel: string
  year: number
  mileage: number
  crashes: 'none' | 'minor' | 'major'
  engineCondition: 'good' | 'fair' | 'poor'
  batteryCondition: 'good' | 'bad'
}

export interface RealEstateDetails {
  propertyType: 'casa' | 'departamento' | 'terreno'
  zone: string
  areaSqm: number
  rooms: number
  bedrooms: number
  bathrooms: number
  hasPatio: boolean
  hasGarage: boolean
  constructionYears: number
  hasPlans: boolean
  taxesUpToDate: boolean
  mortgageEligible: boolean
}

export interface ValuationConfig {
  vehicle: {
    basePrice: number
    mileageMultipliers: {
      under50k: number
      under100k: number
      under150k: number
      over150k: number
    }
    crashesDiscounts: {
      none: number
      minor: number
      major: number
    }
    engineDiscounts: {
      good: number
      fair: number
      poor: number
    }
    batteryDiscount: number
  }
  realEstate: {
    zones: Record<string, number>
    bedroomValue: number
    bathroomValue: number
    garageValue: number
    patioValue: number
  }
}

export const DEFAULT_VALUATION_CONFIG: ValuationConfig = {
  vehicle: {
    basePrice: 12000, // USD
    mileageMultipliers: {
      under50k: 1.0,
      under100k: 0.9,
      under150k: 0.8,
      over150k: 0.65,
    },
    crashesDiscounts: {
      none: 0,
      minor: -1800,
      major: -4800,
    },
    engineDiscounts: {
      good: 0,
      fair: -1200,
      poor: -3600,
    },
    batteryDiscount: -200,
  },
  realEstate: {
    zones: {
      'Yerba Buena': 1500, // USD / sqm
      'Barrio Norte': 1400,
      'Barrio Sur': 1000,
      'Tafí del Valle': 1200,
      'Tafí Viejo': 700,
      'Banda del Río Salí': 500,
      'El Manantial': 600,
      'Centro / San Miguel': 950,
      'Otras zonas': 450,
    },
    bedroomValue: 6000,
    bathroomValue: 4000,
    garageValue: 8000,
    patioValue: 5000,
  },
}

export interface ValuationResult {
  estimatedValue: number
  saleabilityScore: number
  saleabilityLabel: 'Alta' | 'Media' | 'Baja'
  saleabilityReasons: string[]
}

// ──────────────────────────────────────────
// SEGMENTO DEL VEHÍCULO
// ──────────────────────────────────────────

export interface VehicleSegment {
  key: string
  label: string
  /** Factor sobre el precio base de la configuración. */
  multiplier: number
}

/**
 * Segmentos reconocidos, del más barato al más caro. El multiplicador se aplica
 * sobre `config.vehicle.basePrice` (un auto de gama media típico = 1.0).
 *
 * Esto es una aproximación, no una tabla de precios: sirve para que la
 * estimación arranque en el orden de magnitud correcto. Para tasar en serio
 * conviene enganchar una fuente real de precios (InfoAuto, por ejemplo) y usar
 * esto sólo como respaldo.
 */
export const VEHICLE_SEGMENTS: (VehicleSegment & { patterns: string[] })[] = [
  {
    key: 'moto',
    label: 'Moto',
    multiplier: 0.25,
    patterns: ['moto', 'honda cg', 'gilera', 'zanella', 'motomel', 'corven', 'rouser', 'ybr', 'xr 150', 'cb 125'],
  },
  {
    key: 'chico',
    label: 'Auto chico / entrada de gama',
    multiplier: 0.65,
    patterns: ['ka', 'gol', 'up', 'onix', 'celta', 'corsa', 'palio', 'uno', 'mobi', 'spring', 'sandero', 'kwid', 'clio', 'agile', 'fiesta', 'march', 'etios', 'argo', 'cronos', 'polo'],
  },
  {
    key: 'medio',
    label: 'Auto mediano',
    multiplier: 1,
    patterns: ['corolla', 'cruze', 'focus', 'megane', 'civic', 'sentra', 'golf', 'vento', 'virtus', 'jetta', '308', '408', 'c4', 'logan', 'linea', 'elantra'],
  },
  {
    key: 'suv',
    label: 'SUV / crossover',
    multiplier: 1.6,
    patterns: ['suv', 'tracker', 'ecosport', 'duster', 'kicks', 'creta', 'tucson', 'tiguan', 'taos', 'nivus', 'compass', 'renegade', 'territory', 'corolla cross', 'hrv', 'crv', 'sw4', 'pajero', 'captur', 'c3 aircross'],
  },
  {
    key: 'pickup',
    label: 'Pickup / utilitario',
    multiplier: 2.1,
    patterns: ['hilux', 'ranger', 'amarok', 's10', 's-10', 'frontier', 'toro', 'strada', 'saveiro', 'montana', 'oroch', 'maverick', 'f-100', 'f100', 'l200', 'kangoo', 'partner', 'berlingo', 'ducato', 'sprinter', 'master', 'trafic', 'boxer'],
  },
  {
    key: 'premium',
    label: 'Alta gama',
    multiplier: 3.2,
    patterns: ['bmw', 'mercedes', 'audi', 'volvo', 'lexus', 'porsche', 'jaguar', 'land rover', 'range rover', 'mini cooper', 'alfa romeo'],
  },
]

const DEFAULT_SEGMENT: VehicleSegment = {
  key: 'medio',
  label: 'Auto mediano (estimado)',
  multiplier: 1,
}

/**
 * Deduce el segmento a partir de la marca y el modelo escritos a mano.
 * Si no reconoce nada, asume gama media y lo deja dicho en el resultado.
 */
export function detectVehicleSegment(brandModel: string): VehicleSegment & { matched: boolean } {
  const text = (brandModel || '').toLowerCase().trim()
  if (!text) return { ...DEFAULT_SEGMENT, matched: false }

  // Se recorre de mayor a menor precio: "hilux sw4" debe caer en pickup, y una
  // "bmw x5" en premium antes que en SUV.
  for (let i = VEHICLE_SEGMENTS.length - 1; i >= 0; i--) {
    const segment = VEHICLE_SEGMENTS[i]
    if (segment.patterns.some((p) => text.includes(p))) {
      return { key: segment.key, label: segment.label, multiplier: segment.multiplier, matched: true }
    }
  }

  return { ...DEFAULT_SEGMENT, matched: false }
}

/**
 * Calculates vehicle value in USD
 */
export function calculateVehicleValuation(
  details: VehicleDetails,
  config: ValuationConfig = DEFAULT_VALUATION_CONFIG
): ValuationResult {
  const currentYear = new Date().getFullYear()
  const age = Math.max(0, currentYear - details.year)

  // Precio base según el segmento del vehículo.
  //
  // Antes se usaba un único `basePrice` de USD 12.000 para todo: `brandModel`
  // se cargaba en el formulario pero no entraba en ninguna cuenta, así que un
  // Ford Ka y una Hilux salían tasados igual.
  const segment = detectVehicleSegment(details.brandModel)
  let price = config.vehicle.basePrice * segment.multiplier

  // Depreciation: -5% per year of age
  const ageDepreciationMultiplier = Math.max(0.15, 1 - age * 0.05)
  price = price * ageDepreciationMultiplier

  // Mileage multiplier
  let mileageMult = config.vehicle.mileageMultipliers.over150k
  if (details.mileage < 50000) {
    mileageMult = config.vehicle.mileageMultipliers.under50k
  } else if (details.mileage < 100000) {
    mileageMult = config.vehicle.mileageMultipliers.under100k
  } else if (details.mileage < 150000) {
    mileageMult = config.vehicle.mileageMultipliers.under150k
  }
  price = price * mileageMult

  // Crashes deduction
  const crashDiscount = config.vehicle.crashesDiscounts[details.crashes] || 0
  price += crashDiscount

  // Engine conditions deduction
  const engineDiscount = config.vehicle.engineDiscounts[details.engineCondition] || 0
  price += engineDiscount

  // Battery condition
  if (details.batteryCondition === 'bad') {
    price += config.vehicle.batteryDiscount
  }

  // Calulate saleability for vehicle
  let score = 80; // cars are highly liquid usually
  const reasons: string[] = [`Segmento detectado: ${segment.label}.`];
  if (!segment.matched) {
    reasons.push('No se reconoció la marca/modelo: se estimó como gama media. Verificá el valor a mano.')
  }
  if (age > 15) { score -= 20; reasons.push('Más de 15 años de antigüedad reduce el mercado potencial.'); }
  if (details.crashes === 'major') { score -= 30; reasons.push('Daño mayor reportado dificulta la venta.'); }
  if (details.engineCondition === 'poor') { score -= 30; reasons.push('Motor en mal estado requiere reparación previa a la venta.'); }
  if (segment.key === 'premium') { score -= 15; reasons.push('La alta gama tiene menos compradores y tarda más en venderse.'); }

  score = Math.max(0, Math.min(100, score))
  let label: 'Alta' | 'Media' | 'Baja' = 'Media';
  if (score >= 80) label = 'Alta';
  else if (score <= 49) label = 'Baja';

  return {
    estimatedValue: Math.round(Math.max(1000, price)),
    saleabilityScore: score,
    saleabilityLabel: label,
    saleabilityReasons: reasons
  }
}

/**
 * Calculates real estate value in USD
 */
export function calculateRealEstateValuation(
  details: RealEstateDetails,
  config: ValuationConfig = DEFAULT_VALUATION_CONFIG
): ValuationResult {
  // Price per sqm based on zone
  const pricePerSqm = config.realEstate.zones[details.zone] || config.realEstate.zones['Otras zonas'] || 450
  
  let price = details.areaSqm * pricePerSqm

  // Add value for bedrooms and bathrooms
  price += details.bedrooms * config.realEstate.bedroomValue
  price += details.bathrooms * config.realEstate.bathroomValue

  // Add value for garage
  if (details.hasGarage) {
    price += config.realEstate.garageValue
  }

  // Add value for patio
  if (details.hasPatio) {
    price += config.realEstate.patioValue
  }

  // Adjust by property type
  const typeMultipliers = {
    casa: 1.0,
    departamento: 0.95,
    terreno: 0.8,
  }
  const typeMult = typeMultipliers[details.propertyType] || 1.0
  price = price * typeMult

  // ECONOMIC PENALTIES
  // No plans
  if (!details.hasPlans) {
    price = price * 0.95; // -5%
  }
  // Taxes debt
  if (!details.taxesUpToDate) {
    price = price * 0.98; // -2%
  }
  // Age depreciation (after 30 years, -0.5% per extra year)
  if (details.constructionYears > 30) {
    const extraYears = details.constructionYears - 30;
    const depreciationMultiplier = 1 - (extraYears * 0.005);
    price = price * Math.max(0.6, depreciationMultiplier); // up to -40%
  }

  // SALEABILITY CALCULATION
  let score = 30; // base score
  const reasons: string[] = [];

  if (details.mortgageEligible) {
    score += 30;
    reasons.push('Apto crédito hipotecario (acelera mucho la venta).');
  } else {
    reasons.push('No apto crédito (limita compradores a quienes tienen efectivo/dólares billete).');
  }

  if (details.hasPlans) {
    score += 20;
    reasons.push('Planos de mensura vigentes (listo para escriturar).');
  } else {
    reasons.push('Sin planos de mensura (demora escrituración y trámites).');
  }

  if (details.taxesUpToDate) {
    score += 10;
    reasons.push('Impuestos de rentas/municipal al día.');
  } else {
    reasons.push('Deuda de impuestos (resta atractivo y debe saldarse antes de venta).');
  }

  if (details.constructionYears <= 5) {
    score += 10;
    reasons.push('Construcción muy nueva o a estrenar.');
  } else if (details.constructionYears <= 20) {
    score += 5;
    reasons.push('Construcción en edad media aceptable.');
  } else if (details.constructionYears > 40) {
    score -= 10;
    reasons.push('Construcción antigua (puede requerir reciclaje o remodelación de cañerías/eléctrica).');
  }

  score = Math.max(0, Math.min(100, score));

  let label: 'Alta' | 'Media' | 'Baja' = 'Media';
  if (score >= 80) label = 'Alta';
  else if (score <= 49) label = 'Baja';

  return {
    estimatedValue: Math.round(price),
    saleabilityScore: score,
    saleabilityLabel: label,
    saleabilityReasons: reasons
  }
}
