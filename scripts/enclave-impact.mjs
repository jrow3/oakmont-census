// Derive how much of Oakmont each named sub-area accounts for, and how far the headline figures
// could move if it were set aside. Pure — no I/O, no fetching.
//
// Neither area is separable from the Census data: blocks are larger than the areas and nothing is
// published below the block. So this does not "remove" anything. It bounds the effect, using the
// county address counts in enclaves.json against the Decennial block snapshot.

const round1 = (n) => (n == null ? null : Number(n.toFixed(1)));
const pct = (num, den) => (den ? round1((num / den) * 100) : null);

// Two independent ways to split a block's population between an area and the rest of the block.
// They bracket the answer; neither is privileged, because the Census does not publish the split.
function populationEstimates(area, personsPerUnit) {
  const share = area.blockAddresses ? area.addresses / area.blockAddresses : 0;

  // (a) Proportional: the area holds its address share of the block's people.
  const proportional = Math.round(area.blockPopulation * share);

  // (b) Residual: the block's *other* homes hold the community-average number of people, and the
  // area gets what's left. Sharper where the area's households are smaller than average, which is
  // what a senior-living building looks like.
  const otherAddresses = area.blockAddresses - area.addresses;
  const residual = personsPerUnit == null
    ? null
    : Math.max(0, Math.round(area.blockPopulation - otherAddresses * personsPerUnit));

  const both = [proportional, residual].filter((n) => n != null);
  return { proportional, residual, low: Math.min(...both), high: Math.max(...both) };
}

export function buildEnclaveSection(enclaves, blockSnapshot) {
  if (!enclaves || !blockSnapshot) return null;
  const {
    totalPopulation, totalHousingUnits, occupiedUnits,
    ownerOccupied, renterOccupied, age55Plus, age65Plus,
  } = blockSnapshot;

  const personsPerUnit = occupiedUnits ? totalPopulation / occupiedUnits : null;

  const areas = (enclaves.areas || []).map((area) => {
    const share = area.blockAddresses ? area.addresses / area.blockAddresses : 0;
    const units = Math.round(area.blockHousingUnits * share);
    const population = populationEstimates(area, personsPerUnit);

    // If every resident here were under 55, dropping them raises the 55+ share (denominator only).
    // If every resident were 55+, dropping them lowers it (both sides). The truth is between.
    const if55PlusRemoved = pct(age55Plus - population.high, totalPopulation - population.high);
    const ifUnder55Removed = pct(age55Plus, totalPopulation - population.high);
    const if65PlusRemoved = age65Plus == null
      ? null
      : pct(age65Plus - population.high, totalPopulation - population.high);

    const tenure = area.allRental && renterOccupied
      ? {
        pctOfRenterUnits: pct(area.addresses, renterOccupied),
        renterUnits: renterOccupied,
        ownerOccupiedPctWithout: pct(ownerOccupied, ownerOccupied + renterOccupied - area.addresses),
      }
      : null;

    return {
      key: area.key,
      label: area.label,
      note: area.note,
      blockGeoid: area.blockGeoid,
      addresses: area.addresses,
      blockAddresses: area.blockAddresses,
      otherHomesInBlock: area.blockAddresses - area.addresses,
      shareOfBlockPct: pct(area.addresses, area.blockAddresses),
      units,
      pctOfUnits: pct(units, totalHousingUnits),
      population,
      pctOfPopulationLow: pct(population.low, totalPopulation),
      pctOfPopulationHigh: pct(population.high, totalPopulation),
      age: { baseline55Plus: pct(age55Plus, totalPopulation), if55PlusRemoved, ifUnder55Removed, if65PlusRemoved },
      tenure,
    };
  });

  return {
    source: enclaves.source,
    accessed: enclaves.accessed,
    calibration: enclaves.calibration,
    multiUnitProperties: enclaves.multiUnitProperties || [],
    baseline: {
      population: totalPopulation,
      housingUnits: totalHousingUnits,
      occupiedUnits,
      ownerOccupied,
      renterOccupied,
      pct55Plus: pct(age55Plus, totalPopulation),
      pct65Plus: age65Plus == null ? null : pct(age65Plus, totalPopulation),
    },
    areas,
  };
}
