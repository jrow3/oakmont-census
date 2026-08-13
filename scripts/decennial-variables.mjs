// Single source of truth for the 2020 Decennial (DHC) data used by the exact-Oakmont block view.
// Geography is the frozen block list in oakmont-blocks.json; all variables are 100% counts.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const DEC_GEO = {
  dataset: '2020/dec/dhc',
  state: '06',
  county: '097',
  tracts: ['151601', '151602'],
};

export async function loadBlockGeoids() {
  const raw = JSON.parse(await readFile(join(here, 'oakmont-blocks.json'), 'utf8'));
  return new Set(raw.geoids);
}

// Age band code groups (Male + Female), used to derive snapshot figures.
export const AGE_55_PLUS = ['P12_017N','P12_018N','P12_019N','P12_020N','P12_021N','P12_022N','P12_023N','P12_024N','P12_025N',
                            'P12_041N','P12_042N','P12_043N','P12_044N','P12_045N','P12_046N','P12_047N','P12_048N','P12_049N'];
export const AGE_65_PLUS = ['P12_020N','P12_021N','P12_022N','P12_023N','P12_024N','P12_025N',
                            'P12_044N','P12_045N','P12_046N','P12_047N','P12_048N','P12_049N'];
export const AGE_85_PLUS = ['P12_025N','P12_049N'];

export const DEC_GROUPS = {
  age: {
    label: 'Age & Sex (2020)',
    totalKey: 'P12_001N',
    variables: {
      'P12_001N': 'Total Population', 'P12_002N': 'Male - Total',
      'P12_003N': 'Male - Under 5 years', 'P12_004N': 'Male - 5 to 9 years',
      'P12_005N': 'Male - 10 to 14 years', 'P12_006N': 'Male - 15 to 17 years',
      'P12_007N': 'Male - 18 and 19 years', 'P12_008N': 'Male - 20 years',
      'P12_009N': 'Male - 21 years', 'P12_010N': 'Male - 22 to 24 years',
      'P12_011N': 'Male - 25 to 29 years', 'P12_012N': 'Male - 30 to 34 years',
      'P12_013N': 'Male - 35 to 39 years', 'P12_014N': 'Male - 40 to 44 years',
      'P12_015N': 'Male - 45 to 49 years', 'P12_016N': 'Male - 50 to 54 years',
      'P12_017N': 'Male - 55 to 59 years', 'P12_018N': 'Male - 60 and 61 years',
      'P12_019N': 'Male - 62 to 64 years', 'P12_020N': 'Male - 65 and 66 years',
      'P12_021N': 'Male - 67 to 69 years', 'P12_022N': 'Male - 70 to 74 years',
      'P12_023N': 'Male - 75 to 79 years', 'P12_024N': 'Male - 80 to 84 years',
      'P12_025N': 'Male - 85 years and over', 'P12_026N': 'Female - Total',
      'P12_027N': 'Female - Under 5 years', 'P12_028N': 'Female - 5 to 9 years',
      'P12_029N': 'Female - 10 to 14 years', 'P12_030N': 'Female - 15 to 17 years',
      'P12_031N': 'Female - 18 and 19 years', 'P12_032N': 'Female - 20 years',
      'P12_033N': 'Female - 21 years', 'P12_034N': 'Female - 22 to 24 years',
      'P12_035N': 'Female - 25 to 29 years', 'P12_036N': 'Female - 30 to 34 years',
      'P12_037N': 'Female - 35 to 39 years', 'P12_038N': 'Female - 40 to 44 years',
      'P12_039N': 'Female - 45 to 49 years', 'P12_040N': 'Female - 50 to 54 years',
      'P12_041N': 'Female - 55 to 59 years', 'P12_042N': 'Female - 60 and 61 years',
      'P12_043N': 'Female - 62 to 64 years', 'P12_044N': 'Female - 65 and 66 years',
      'P12_045N': 'Female - 67 to 69 years', 'P12_046N': 'Female - 70 to 74 years',
      'P12_047N': 'Female - 75 to 79 years', 'P12_048N': 'Female - 80 to 84 years',
      'P12_049N': 'Female - 85 years and over',
    },
  },
  race: {
    label: 'Race (2020)',
    totalKey: 'P3_001N',
    variables: {
      'P3_001N': 'Total Population', 'P3_002N': 'White alone',
      'P3_003N': 'Black or African American alone', 'P3_004N': 'American Indian and Alaska Native alone',
      'P3_005N': 'Asian alone', 'P3_006N': 'Native Hawaiian and Other Pacific Islander alone',
      'P3_007N': 'Some Other Race alone', 'P3_008N': 'Two or More Races',
    },
  },
  hispanic: {
    label: 'Hispanic or Latino Origin (2020)',
    totalKey: 'P4_001N',
    variables: {
      'P4_001N': 'Total Population', 'P4_002N': 'Not Hispanic or Latino',
      'P4_003N': 'Hispanic or Latino',
    },
  },
  housing: {
    label: 'Housing (2020)',
    totalKey: 'H1_001N',
    variables: {
      'H1_001N': 'Total Housing Units', 'H3_002N': 'Occupied', 'H3_003N': 'Vacant',
      'H4_002N': 'Owner-occupied, with a mortgage or loan', 'H4_003N': 'Owner-occupied, free and clear',
      'H4_004N': 'Renter-occupied',
    },
  },
};

// Every variable code the fetch needs (deduped).
export const DEC_VARS = [...new Set(Object.values(DEC_GROUPS).flatMap((g) => Object.keys(g.variables)))];

// Numeric age-band bounds for the P12 (sex-by-age) table, male+female codes combined.
// Used to compute a grouped median age across the summed blocks. The open-ended 85+ band
// is capped at 95 so the interpolation has a finite width.
export const P12_AGE_BANDS = [
  { lower: 0,  upper: 5,  codes: ['P12_003N', 'P12_027N'] },
  { lower: 5,  upper: 10, codes: ['P12_004N', 'P12_028N'] },
  { lower: 10, upper: 15, codes: ['P12_005N', 'P12_029N'] },
  { lower: 15, upper: 18, codes: ['P12_006N', 'P12_030N'] },
  { lower: 18, upper: 20, codes: ['P12_007N', 'P12_031N'] },
  { lower: 20, upper: 21, codes: ['P12_008N', 'P12_032N'] },
  { lower: 21, upper: 22, codes: ['P12_009N', 'P12_033N'] },
  { lower: 22, upper: 25, codes: ['P12_010N', 'P12_034N'] },
  { lower: 25, upper: 30, codes: ['P12_011N', 'P12_035N'] },
  { lower: 30, upper: 35, codes: ['P12_012N', 'P12_036N'] },
  { lower: 35, upper: 40, codes: ['P12_013N', 'P12_037N'] },
  { lower: 40, upper: 45, codes: ['P12_014N', 'P12_038N'] },
  { lower: 45, upper: 50, codes: ['P12_015N', 'P12_039N'] },
  { lower: 50, upper: 55, codes: ['P12_016N', 'P12_040N'] },
  { lower: 55, upper: 60, codes: ['P12_017N', 'P12_041N'] },
  { lower: 60, upper: 62, codes: ['P12_018N', 'P12_042N'] },
  { lower: 62, upper: 65, codes: ['P12_019N', 'P12_043N'] },
  { lower: 65, upper: 67, codes: ['P12_020N', 'P12_044N'] },
  { lower: 67, upper: 70, codes: ['P12_021N', 'P12_045N'] },
  { lower: 70, upper: 75, codes: ['P12_022N', 'P12_046N'] },
  { lower: 75, upper: 80, codes: ['P12_023N', 'P12_047N'] },
  { lower: 80, upper: 85, codes: ['P12_024N', 'P12_048N'] },
  { lower: 85, upper: 95, codes: ['P12_025N', 'P12_049N'] },
];
