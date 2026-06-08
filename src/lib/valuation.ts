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

/**
 * Calculates vehicle value in USD
 */
export function calculateVehicleValuation(
  details: VehicleDetails,
  config: ValuationConfig = DEFAULT_VALUATION_CONFIG
): number {
  const currentYear = new Date().getFullYear()
  const age = Math.max(0, currentYear - details.year)
  
  // Base price
  let price = config.vehicle.basePrice

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

  // Ensure price doesn't drop below a minimum scrap value ($1,000 USD)
  return Math.round(Math.max(1000, price))
}

/**
 * Calculates real estate value in USD
 */
export function calculateRealEstateValuation(
  details: RealEstateDetails,
  config: ValuationConfig = DEFAULT_VALUATION_CONFIG
): number {
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

  // Adjust by property type (casa gets 1.0, departamento gets 0.95 due to shared land, terreno gets 0.8)
  const typeMultipliers = {
    casa: 1.0,
    departamento: 0.95,
    terreno: 0.8,
  }
  const typeMult = typeMultipliers[details.propertyType] || 1.0
  price = price * typeMult

  return Math.round(price)
}
