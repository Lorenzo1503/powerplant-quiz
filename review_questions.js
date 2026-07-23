/**
 * Question Bank Review Script
 * 
 * Processes questions in batches of 50:
 * 1. Independently solves and verifies every question
 * 2. Corrects inaccurate questions, options, answer keys, terminology
 * 3. Completes missing fields
 * 4. Rewrites unclear/defective questions
 * 5. Improves explanations
 * 6. Adds review-tracking columns
 * 7. Outputs to QuestionBank_Reviewed.csv
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

// ===== CONFIGURATION =====
const BATCH_SIZE = 50;
const INPUT_FILE = path.join(__dirname, 'question_bank.csv');
const OUTPUT_FILE = path.join(__dirname, 'QuestionBank_Reviewed.csv');
const PROGRESS_FILE = path.join(__dirname, 'review_progress.json');

// ===== REVIEW TRACKING COLUMNS =====
const REVIEW_COLUMNS = [
  'AIReviewStatus',
  'FieldsChanged',
  'CorrectionSummary',
  'References',
  'ConfidenceLevel',
  'HumanReviewRequired',
  'HumanReviewReason',
  'AIReviewedDate',
  'BatchNumber'
];

// ===== EXPERT KNOWLEDGE BASE =====
// Engineering constants, formulas, and verified facts for independent verification

const THERMODYNAMICS_KNOWLEDGE = {
  // Gas constants (kJ/kg·K)
  R_air: 0.287,
  R_hydrogen: 4.124,
  R_helium: 2.077,
  R_nitrogen: 0.297,
  R_oxygen: 0.260,
  R_steam: 0.4615,
  
  // Specific heats (kJ/kg·K)
  cp_air: 1.005,
  cv_air: 0.718,
  k_air: 1.4,
  
  // Standard values
  std_atm: 101.325, // kPa
  std_temp: 25, // °C
  abs_zero_C: -273.15,
  abs_zero_F: -459.67,
  
  // Avogadro's number
  avogadro: 6.02214076e23,
  
  // Stefan-Boltzmann constant (W/m²·K⁴)
  sigma: 5.67e-8,
  
  // Prandtl number for air at room temp
  pr_air: 0.7,
  
  // Latent heat of vaporization of water (kJ/kg)
  hfg_water: 2257,
  
  // Melting points (°C)
  mp_mercury: -38.83,
  mp_tin: 231.93,
  mp_zinc: 419.53,
  mp_antimony: 630.63,
  mp_silver: 961.78,
  mp_gold: 1064.18,
  mp_tungsten: 3422,
  mp_platinum: 1768.3,
  
  // Boiling points (°C)
  bp_hydrogen: -252.87,
  bp_nitrogen: -195.8,
  bp_oxygen: -182.96,
  bp_sulfur: 444.6,
  
  // Critical point of mercury
  critical_temp_mercury: 1460, // °C (approx)
  critical_pressure_mercury: 108, // MPa (approx)
  
  // Thermal conductivity (W/m·K)
  k_copper: 401,
  k_brass: 109,
  k_steel: 50.2,
  k_wood: 0.12,
  k_glass_wool: 0.04,
  k_asbestos: 0.08,
  k_water: 0.6,
  k_glycerin: 0.29,
  k_gasoline: 0.15,
  k_alcohol: 0.17,
  
  // Thermal diffusivity unit
  thermal_diffusivity_unit: 'm²/s',
  
  // SI unit of thermal conductivity
  k_si_unit: 'W/m·K',
  
  // Biot number definition
  biot: 'Ratio of internal thermal resistance to boundary layer thermal resistance',
  
  // Fourier number definition
  fourier: 'Ratio of heat conducted to energy stored',
  
  // Prandtl number definition
  prandtl: 'Ratio of momentum diffusivity to thermal diffusivity',
  
  // Nusselt number definition
  nusselt: 'Ratio of convective to conductive heat transfer across a boundary',
  
  // View factor for black body
  view_factor_blackbody: 1,
  
  // Emissivity of white body
  emissivity_white: 0,
  
  // Transmissivity of opaque material
  transmissivity_opaque: 0,
  
  // Dittus-Boelter equation applies to
  dittus_boelter: 'Turbulent flow',
  
  // Sutherland equation for
  sutherland: 'Gas viscosity and thermal conductivity',
  
  // Maxwell's theory constant for triatomic gases
  maxwell_triatomic: 1.7,
  
  // Rankine cycle effects
  rankine_reheat_heat_rejected: 'Increases',
  rankine_increase_boiler_pressure_moisture: 'Increases',
  rankine_superheat_moisture: 'Decreases',
  rankine_superheat_efficiency: 'Increases',
  rankine_regeneration_efficiency: 'Increases',
  rankine_lower_condenser_pressure_heat_rejected: 'Decreases',
  
  // Carnot cycle
  carnot_processes: 'Two isothermal and two isentropic',
  
  // Stirling cycle
  stirling_processes: 'Two isothermal and two constant volume',
  stirling_working_fluid: 'Compressible fluids (hydrogen, helium)',
  
  // Ericsson cycle
  ericsson_processes: 'Two isothermal and two constant pressure',
  
  // Brayton cycle
  brayton_heat_transfer: 'Isobaric process',
  brayton_known_as: 'Joule cycle',
  
  // Otto cycle efficiency depends on
  otto_efficiency_depends: 'Compression ratio and specific heat ratio',
  
  // Diesel cycle
  diesel_cutoff_increase: 'Efficiency decreases',
  diesel_cutoff_decrease: 'Efficiency increases',
  
  // Polytropic process
  polytropic_n_infinity: 'Constant volume (isochoric)',
  polytropic_n_0: 'Constant pressure (isobaric)',
  polytropic_n_1: 'Constant temperature (isothermal)',
  polytropic_n_k: 'Isentropic (adiabatic)',
  
  // Compressibility factor
  z_factor: 'Z = PV/RT',
  
  // Quality definition
  quality: 'Fraction of total mass that is saturated vapor',
  
  // Enthalpy of vaporization
  hfg: 'hg - hf',
  
  // Mollier diagram
  mollier: 'h-s plane',
  
  // Triple point
  triple_point: 'Solid, liquid, and gaseous phases are in equilibrium',
  
  // Critical point
  critical_point: 'Temperature and pressure at which liquid and vapor are indistinguishable',
  
  // First law for steady flow
  first_law_steady_flow: 'Q + vdp = h2 - h1',
  
  // Work in isothermal process
  isothermal_work: 'W = mRT ln(V2/V1)',
  
  // Work in isometric process
  isometric_work: 0,
  
  // Entropy change for irreversible process
  entropy_irreversible: 'Delta S_total > 0',
  
  // Kelvin-Planck statement
  kelvin_planck: 'It is impossible to construct a heat engine that operates in a cycle and receives a given quantity of heat from a high temperature body and does an equal amount of work',
  
  // Clausius statement
  clausius: 'Heat cannot flow from cold substance to hot substance without external work',
  
  // Prevost theory
  prevost: 'All bodies above absolute zero emit radiation',
  
  // Duhring's rule
  duhring: 'Boiling point of a solution is a linear function of water at the same pressure',
  
  // Fenestration
  fenestration: 'Glazed aperture in a building envelope',
  
  // Thermal bridge
  thermal_bridge: 'Envelope area with significantly higher rate of heat transfer',
  
  // Cooling tower
  cooling_tower_cooling: 'Evaporation',
  cooling_tower_lowest_temp: 'Wet bulb temperature',
  cooling_tower_range: 'Warm water temp minus cold water temp',
  cooling_tower_approach: 'Cold water temp minus wet bulb temp',
  cooling_tower_bleed_off: 'Prevents accumulation of dissolved mineral solids',
  cooling_tower_drift_loss: '0.1-0.2% (not 10-20%)',
  
  // Heat exchanger
  hx_1_2: 'Single pass on shell side, double pass on tube side',
  regenerator: 'Hot and cold fluids alternately over a surface',
  floating_head: 'Avoid deformation of tubes due to thermal expansion',
  
  // Fouling factor
  fouling_factor: 'Accounts for dirt and scale buildup on heat transfer surfaces',
  
  // Baudelot cooler
  baudelot: 'Water flows by gravity over outside of tubes or plates',
  
  // Evaporative condenser
  evaporative_condenser: 'Combines condenser and cooling tower into one',
  
  // Steam trap
  steam_trap: 'Automatic device',
  
  // Steam separator
  steam_separator: 'Separates moisture from steam',
  
  // Radiant superheater
  radiant_superheater: 'Placed near furnace to receive radiation from flame',
  
  // Fire wall rating
  fire_wall_rating: 'Not less than 4 hours',
  
  // Cryogenics
  cryogenics: 'Science of low temperature',
  
  // Calorimetry
  calorimetry: 'Science of measuring energy and enthalpy',
  
  // Mean effective pressure
  mep: 'Average pressure on a surface when changing pressure condition exists',
  
  // Specific heat relation
  cp_cv_R: 'Cp = Cv + R applies to ideal gases',
  
  // Enthalpy of ideal gas
  enthalpy_ideal_gas: 'Function of temperature only',
  
  // Internal energy of ideal gas
  internal_energy_ideal_gas: 'Function of temperature only',
  
  // Superheated vapor
  superheated_vapor: 'Temperature higher than saturation temperature at given pressure',
  
  // Subcooled liquid
  subcooled_liquid: 'Temperature lower than saturation temperature at given pressure',
  
  // Compressed liquid
  compressed_liquid: 'Pressure higher than saturation pressure at given temperature',
  
  // Saturated vapor
  saturated_vapor: 'Vapor at saturation temperature and pressure',
  
  // Saturated liquid
  saturated_liquid: 'Liquid at saturation temperature and pressure',
  
  // Pure substance
  pure_substance: 'Homogeneous in composition and chemical aggregation',
  
  // Simple substance
  simple_substance: 'State defined by two independent intensive properties',
  
  // Quasi-static process
  quasi_static: 'System departs from equilibrium only infinitesimally',
  
  // Externally reversible
  externally_reversible: 'No irreversibilities outside system boundaries',
  
  // Perpetual motion machine of second kind
  pmm2: 'Violates second law of thermodynamics',
  
  // Perpetual motion machine of first kind
  pmm1: 'Violates first law of thermodynamics',
  
  // Heat engine
  heat_engine: 'Converts heat to work, operates in a cycle',
  
  // Heat reservoir
  heat_reservoir: 'Heat source or sink for another system',
  
  // Adiabatic surface
  adiabatic_surface: 'Impervious to heat',
  
  // Isolated system
  isolated_system: 'No mass or energy crosses boundaries',
  
  // Closed system
  closed_system: 'No mass crosses boundaries, energy may cross',
  
  // Open system
  open_system: 'Mass and energy cross boundaries',
  
  // Extensive property
  extensive: 'Depends on mass of system',
  
  // Intensive property
  intensive: 'Independent of mass of system',
  
  // Specific property
  specific: 'Property per unit mass',
  
  // State
  state: 'Condition identified by properties',
  
  // Process
  process: 'Change in properties of a system',
  
  // Cycle
  cycle: 'Series of processes returning to initial state',
  
  // System
  system: 'Collection of matter under consideration',
  
  // Surrounding
  surrounding: 'Region outside the boundary',
  
  // Absolute pressure
  absolute_pressure: 'Measured above perfect vacuum',
  
  // Gage pressure
  gage_pressure: 'Measured from atmospheric pressure',
  
  // Atmospheric pressure
  atmospheric_pressure: 'Pressure from barometric reading',
  
  // Sensible heat
  sensible_heat: 'Changes temperature without phase change',
  
  // Latent heat
  latent_heat: 'Changes phase without temperature change',
  
  // Entropy
  entropy: 'Measure of randomness or disorder',
  
  // Enthalpy
  enthalpy: 'Heat energy transferred at constant pressure',
  
  // Internal energy
  internal_energy: 'Energy stored within the body',
  
  // Perfect gas
  perfect_gas: 'Follows Boyle\'s and Charles\' laws',
  
  // Boyle's law
  boyle: 'PV = constant at constant T',
  
  // Charles' law
  charles: 'V/T = constant at constant P',
  
  // Dalton's law
  dalton: 'Sum of partial pressures equals total pressure',
  
  // Avogadro's law
  avogadro_law: 'Equal volumes at same T and P contain equal number of molecules',
  
  // Zeroth law
  zeroth_law: 'If two bodies are in thermal equilibrium with a third, they are in equilibrium with each other',
  
  // Third law
  third_law: 'Entropy of pure substance approaches zero as T approaches 0 K',
  
  // First law
  first_law: 'Energy can neither be created nor destroyed',
  
  // Second law
  second_law: 'Heat cannot be completely converted to work in a cycle',
  
  // Boiling point
  boiling_point: 'Temperature at which vapor pressure equals external pressure',
  
  // Power
  power: 'Rate of doing work per unit time',
  
  // Joule
  joule: 'Newton-meter',
  
  // SI pressure unit
  si_pressure: 'Pascal (N/m²)',
  
  // kg/m-s is not a pressure unit
  not_pressure_unit: 'kg/m-s',
  
  // BTU/hp-hr is not a rate of heat transfer
  not_heat_rate_unit: 'BTU/hp-hr',
  
  // Power units
  power_units: ['ft-lb/s', 'kW', 'BTU/hr', 'W'],
  
  // Temperature scales
  rankine: 'Absolute Fahrenheit scale',
  kelvin: 'Absolute Celsius scale',
  
  // Fahrenheit introduced
  fahrenheit_year: 1720,
  
  // Celsius introduced
  celsius_year: 1742,
  
  // Thermocouple discovered by
  thermocouple_discoverer: 'Seebeck',
  
  // Density
  density: 'Mass per unit volume',
  
  // Specific weight
  specific_weight: 'Weight per unit volume',
  
  // Specific volume
  specific_volume: 'Volume per unit mass (reciprocal of density)',
  
  // Weight
  weight: 'Force of gravity on a body',
  
  // Kilogram is the only base unit with prefix
  kilogram_prefix: 'Kilogram',
  
  // Avogadro's number
  avogadro_number: '6.022 x 10^23',
  
  // Gas constant / Avogadro's number = Boltzmann constant
  boltzmann: 'Boltzmann constant',
  
  // RMS velocity of hydrogen at NTP
  rms_hydrogen: 1839, // m/s
  
  // Heat engine efficiency example
  heat_engine_efficiency: 'eta = W/Q_in = 9kW / 30kW = 0.3 = 30%',
  
  // Free expansion
  free_expansion: 'Q=0, W=0, Delta U=0, temperature change depends on gas',
  
  // Inelastic collisions in real gases
  real_gas_collisions: 'Inelastic',
  
  // Beattie-Bridgeman equation
  beattie_bridgeman: 'Accurate for moderate densities',
  
  // Air standard efficiency assumptions
  air_standard: 'Gases do not dissociate at higher temperatures',
  
  // Compression and expansion of spring
  spring_process: 'Reversible process',
  
  // Exhaust gases
  exhaust_gases: 'Kinetic energy',
  
  // Helical spring
  helical_spring: 'Reversible process',
  
  // Heat exchange process with PV=constant
  pv_constant_process: 'Hyperbolic process (isothermal for ideal gas)',
  
  // Same heat input and compression ratio
  same_heat_compression: 'Otto cycle is more efficient than Diesel cycle',
  
  // Regenerative with infinite feedwater heaters
  infinite_regeneration: 'Carnot cycle efficiency',
  
  // By intercooling in Brayton
  intercooling_backwork: 'Decreases',
  
  // Multistage expansion with reheating
  reheat_thermal_efficiency: 'Decreases',
  
  // Single-stage vs multistage
  multistage_expansion: 'Decreases thermal efficiency without regeneration',
  
  // Pump work fraction
  pump_work_fraction: '0.0004 (very small, ~0.04%)',
  
  // Superheat effect on pump work
  superheat_pump_work: 'Remains the same',
  
  // Reheat effect on moisture
  reheat_moisture: 'Decreases',
  
  // Regeneration effect on heat rejected
  regeneration_heat_rejected: 'Decreases',
  
  // Lower condenser pressure effect
  lower_condenser_pressure: 'Heat rejected decreases, efficiency increases',
  
  // Increase boiler pressure effect
  increase_boiler_pressure: 'Heat rejected decreases, moisture increases',
  
  // Superheat to higher temperature
  superheat_higher_temp: 'Efficiency increases, moisture decreases',
  
  // Reversible heat engines
  reversible_engines_same: 'All reversible heat engines between same reservoirs have same efficiency',
  
  // Adiabatic process
  adiabatic: 'No heat transfer',
  
  // Isothermal process
  isothermal: 'Constant temperature, Delta U = 0 for ideal gas',
  
  // Isobaric process
  isobaric: 'Constant pressure',
  
  // Isochoric process
  isochoric: 'Constant volume',
  
  // Throttling process
  throttling: 'Constant enthalpy (isenthalpic)',
  
  // Flow work
  flow_work: 'Pv (pressure times specific volume)',
  
  // Shaft work from Vdp
  shaft_work_vdp: 'Integral of Vdp represents shaft work in flow process',
  
  // Kinetic energy
  kinetic_energy: 'Energy of motion',
  
  // Potential energy
  potential_energy: 'Energy of position',
  
  // Conservation of energy
  conservation_energy: 'Total energy in any isolated system remains constant',
  
  // Control volume
  control_volume: 'Fixed region in space',
  
  // Fusion curve
  fusion_curve: 'Separates solid from liquid phase on P-T diagram',
  
  // Vaporization curve
  vaporization_curve: 'Separates liquid from vapor phase on P-T diagram',
  
  // Sublimation curve
  sublimation_curve: 'Separates solid from vapor phase on P-T diagram',
  
  // Vapor below critical temperature
  vapor_below_critical: 'Vapor',
  
  // Superheated vapor behaves
  superheated_behavior: 'Approximately as a gas',
  
  // Two independent properties
  two_properties: 'Two independent intensive properties fix state of pure substance',
  
  // Enthalpy definition
  enthalpy_def: 'h = u + Pv',
  
  // Water at reference where enthalpy is zero
  water_reference: 'Internal energy is negative (triple point reference)',
  
  // Compressibility factor
  z_definition: 'Z = Pv/RT',
  
  // Quality definition
  quality_def: 'Fraction of total mass that is saturated vapor',
  
  // Heat of vaporization
  hfg_def: 'hg - hf',
  
  // Isometric work
  isometric_work_def: 0,
  
  // Isothermal work for ideal gas
  isothermal_work_def: 'W = mRT ln(V2/V1)',
  
  // Polytropic exponent for isobaric
  n_isobaric: 0,
  
  // Polytropic exponent for isochoric
  n_isochoric: 'Infinity',
  
  // Polytropic exponent for isothermal
  n_isothermal: 1,
  
  // Polytropic exponent for isentropic
  n_adiabatic: 'k (specific heat ratio)',
  
  // Adiabatic vs isentropic
  adiabatic_vs_isentropic: 'Adiabatic: Q=0; Isentropic: Q=0 and reversible',
  
  // Entropy change for reversible adiabatic
  entropy_rev_adiabatic: 0,
  
  // dQ = Tds for
  dq_tds: 'Reversible process',
  
  // Total entropy for any process
  total_entropy: 'Delta S_total >= 0',
  
  // Entropy of crystal at 0 K
  entropy_crystal_0K: 0,
  
  // Energy changes representation
  energy_representation: 'dQ/T is not an energy change representation',
  
  // Equilibrium condition
  equilibrium: 'Not in steady state flow process',
  
  // Substance homogeneous
  pure_substance_def: 'Homogeneous in composition and chemical aggregation',
  
  // Simple substance def
  simple_substance_def: 'State defined by variable intensive properties',
  
  // Only base unit with prefix
  only_kilo_prefix: 'Kilogram',
  
  // Force of gravity on body
  gravity_force: 'Weight',
  
  // Total mass per unit volume
  mass_per_volume: 'Density',
  
  // Force of gravity on unit volume
  gravity_per_volume: 'Specific weight',
  
  // Reciprocal of density
  reciprocal_density: 'Specific volume',
  
  // Avogadro's number value
  avogadro_value: '6.022 x 10^23',
  
  // Gas constant / Avogadro's number
  R_over_Na: 'Boltzmann constant',
  
  // Absolute zero Fahrenheit
  abs_zero_F_value: -459.67,
  
  // Absolute zero Celsius
  abs_zero_C_value: -273.15,
  
  // Absolute temperature Fahrenheit scale
  abs_temp_F: 'Degrees Rankine',
  
  // Absolute temperature Celsius scale
  abs_temp_C: 'Degrees Kelvin',
  
  // Bureau of Standards - hydrogen
  std_hydrogen: -252.87, // °C
  
  // Bureau of Standards - nitrogen
  std_nitrogen: -195.8, // °C
  
  // Bureau of Standards - oxygen
  std_oxygen: -182.96, // °C
  
  // Bureau of Standards - mercury
  std_mercury: -38.83, // °C
  
  // Bureau of Standards - tin
  std_tin: 231.93, // °C
  
  // Bureau of Standards - zinc
  std_zinc: 419.53, // °C
  
  // Bureau of Standards - sulfur
  std_sulfur: 444.6, // °C
  
  // Bureau of Standards - antimony
  std_antimony: 630.63, // °C
  
  // Bureau of Standards - silver
  std_silver: 961.78, // °C
  
  // Bureau of Standards - gold
  std_gold: 1064.18, // °C
  
  // Bureau of Standards - tungsten
  std_tungsten: 3422, // °C
  
  // Bureau of Standards - platinum
  std_platinum: 1768.3, // °C
  
  // Thermocouple discoverer
  seebeck: 'Seebeck',
  
  // Heat transfer modes
  heat_transfer_modes: 3, // conduction, convection, radiation
  
  // Radiation requires no medium
  radiation_no_medium: true,
  
  // Conduction occurs in
  conduction_medium: 'Solids, liquids, and gases',
  
  // Convection occurs in
  convection_medium: 'Liquids and gases',
  
  // Natural convection
  natural_convection: 'Due to density difference caused by temperature difference',
  
  // Forced convection
  forced_convection: 'Due to mechanical device (fan, pump)',
  
  // Heat transfer driving force
  heat_driving_force: 'Temperature difference',
  
  // Thermal conductivity depends on
  k_depends: ['Physical state', 'Chemical composition', 'Temperature', 'Pressure'],
  
  // Thermal conductivity independent of
  k_independent: 'Gravitational pull',
  
  // Metals good conductors because
  metals_conduct: 'Free electrons',
  
  // Styrofoam insulator because
  styrofoam_insulator: 'Contains many tiny pockets of air',
  
  // Steam causes more burn because
  steam_burn: 'Contains more internal energy (latent heat)',
  
  // Condensation warms surrounding
  condensation_warming: true,
  
  // Emissivity
  emissivity: 'Effectiveness of a body as a thermal radiator',
  
  // Emittance
  emittance: 'Ratio of radiation of actual body to blackbody',
  
  // Absorptivity
  absorptivity: 'Fraction of incident radiation absorbed',
  
  // Gray body
  gray_body: 'Emissivity less than 1, independent of wavelength',
  
  // Black body
  black_body: 'Absorbs all incident radiation, emits maximum possible energy',
  
  // White body
  white_body: 'Reflects all incident radiation, emissivity = 0',
  
  // Opaque body
  opaque_body: 'Transmissivity = 0',
  
  // Transparent body
  transparent_body: 'Transmits incident radiation',
  
  // View factor range
  view_factor_range: '0 to 1',
  
  // View factor for gray body
  view_factor_gray: 'Greater than 0 but less than 1',
  
  // Iron color at highest temperature
  iron_highest_temp: 'White',
  
  // Heat flow direction
  heat_flow_direction: 'Decreasing temperature',
  
  // Heat transfer rate depends on
  heat_rate_depends: ['Temperature difference', 'Area', 'Thickness', 'Thermal conductivity'],
  
  // Heat transfer rate independent of
  heat_rate_independent: 'Specific heat',
  
  // Thermal radiator function
  thermal_radiator: 'Transfer heat with or without a medium',
  
  // Not a good conductor
  not_good_conductor: 'Asbestos',
  
  // Not a heat exchanger
  not_heat_exchanger: 'Water hammer',
  
  // Parallel flow
  parallel_flow: 'Fluids flow in same direction',
  
  // Counter flow
  counter_flow: 'Fluids flow in opposite directions',
  
  // Cross flow
  cross_flow: 'Fluids flow at right angles',
  
  // LMTD correction needed for
  lmtd_correction: 'Cross flow and multi-pass heat exchangers',
  
  // 1-2 heat exchanger
  hx_1_2_def: '1 shell pass, 2 tube passes',
  
  // Floating head purpose
  floating_head_purpose: 'Allow thermal expansion of tubes',
  
  // One transfer unit (NTU)
  ntu: 'Condition when temperature change of one stream equals average driving force',
  
  // Regenerator
  regenerator_def: 'Hot and cold fluids alternately pass over same surface',
  
  // Adsorbent
  adsorbent: 'High surface area, porous structure, hydrophobic surface',
  
  // Activated carbon
  activated_carbon: 'High temperature removal of tarry substances',
  
  // Cooling tower water cooling
  ct_cooling: 'Evaporation',
  
  // Cooling tower lowest possible temperature
  ct_lowest: 'Wet bulb temperature',
  
  // Cooling tower range
  ct_range: 'Warm water temp minus cold water temp',
  
  // Cooling tower approach
  ct_approach: 'Cold water temp minus wet bulb temp',
  
  // Cooling tower bleed-off
  ct_bleed: 'Prevents accumulation of dissolved minerals',
  
  // Cooling tower drift loss
  ct_drift: '0.1-0.2% of circulation (not 10-20%)',
  
  // Condenser cleaning frequency
  condenser_cleaning: 'Every 6 months',
  
  // Zinc rods in condenser
  zinc_rods: 'Salt water side (cathodic protection)',
  
  // Evaporative condenser
  evap_condenser: 'Cools condenser vapor using both air and water',
  
  // Baudelot cooler
  baudelot_cooler: 'Water flows by gravity over outside of tubes',
  
  // Cooling tower efficiency vs heat exchanger
  ct_vs_hx: 'Temperature profiles of air and water can cross each other',
  
  // Greatest limiting factor for cooling tower
  ct_limiting: 'Wet bulb temperature',
  
  // Condenser equilibrium
  condenser_equilibrium: 'Cooling tower range must equal temperature rise in condenser',
  
  // Steam trap
  steam_trap_def: 'Automatic device',
  
  // Steam separator function
  steam_separator_func: 'Separates moisture from steam',
  
  // Radiant superheater location
  radiant_sh_location: 'Near furnace',
  
  // Fire wall rating
  fire_wall: '4 hours',
  
  // Cryogenics definition
  cryogenics_def: 'Science of low temperature',
  
  // Calorimetry definition
  calorimetry_def: 'Science of measuring energy and enthalpy',
  
  // Mean effective pressure
  mep_def: 'Average pressure when changing pressure condition exists',
  
  // Cp = Cv + R applies to
  cp_cv_r_applies: 'Ideal gases',
  
  // Enthalpy of ideal gas function
  h_ideal_gas: 'Temperature only',
  
  // Internal energy of ideal gas function
  u_ideal_gas: 'Temperature only',
  
  // Isothermal compression of ideal gas
  isothermal_compression: 'Enthalpy change = 0',
  
  // Adiabatic compression
  adiabatic_compression: 'Temperature increases',
  
  // SI unit of pressure
  si_pressure_unit: 'Pascal',
  
  // kg/m-s is
  kg_ms: 'Unit of dynamic viscosity, not pressure',
  
  // BTU/hp-hr is
  btu_hp_hr: 'Unit of brake specific fuel consumption, not heat transfer rate',
  
  // Water has highest thermal conductivity among common liquids
  water_k_highest: true,
  
  // Thermal conductivity of diatomic gases with temperature
  k_diatomic_temp: 'Increases with temperature',
  
  // Thermal conductivity of pure metals at high temperature
  k_metal_high_temp: 'Almost constant except for ferromagnetic materials',
  
  // Heat transfer coefficient vs viscosity
  h_viscosity: 'Heat transfer coefficient decreases as viscosity increases',
  
  // Thermal diffusivity
  thermal_diffusivity: 'Property that measures rate of heat transfer to energy storage',
  
  // Fourier's law
  fourier_law: 'Heat flux is proportional to temperature gradient',
  
  // Newton's law of cooling
  newton_cooling: 'Heat transfer is proportional to temperature difference',
  
  // Stefan-Boltzmann law
  stefan_boltzmann: 'E = sigma * T^4',
  
  // Kirchhoff's law
  kirchhoff_law: 'Emissivity = Absorptivity at thermal equilibrium',
  
  // Planck's law
  planck_law: 'Spectral distribution of blackbody radiation',
  
  // Lambert's law
  lambert_law: 'Cosine law of radiation',
  
  // Prevost theory
  prevost_theory: 'All bodies above absolute zero emit radiation',
  
  // Dittus-Boelter equation
  dittus_boelter_eq: 'For turbulent flow in smooth tubes',
  
  // Sutherland equation for
  sutherland_eq: 'Gas thermal conductivity and viscosity',
  
  // Maxwell's theory constant
  maxwell_constant: '1.7 for triatomic gases',
  
  // Non-isotropic conductivity
  non_isotropic: 'Wood (anisotropic)',
  
  // Glass wool conductivity depends on
  glass_wool_k: ['Structure', 'Density', 'Composition'],
  
  // Prandtl number for air
  pr_air_value: 0.7,
  
  // Least Prandtl number
  pr_least: 'Liquid metals',
  
  // Duhring's
