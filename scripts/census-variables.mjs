// Census variable definitions for Oakmont Village (Sonoma County tracts 1516.01 + 1516.02).
// Single source of truth for geography, which variables are medians, and every variable's
// friendly label. fetch-census.mjs emits these labels into site/data.json so the page is
// fully data-driven.

export const GEO = {
  state: '06',   // California
  county: '097', // Sonoma County
  tracts: ['151601', '151602'], // Oakmont Village census tracts 1516.01 + 1516.02
  popVar: 'B01001_001E',        // total population, used to weight medians
};

// ACS 5-year vintages that get the full treatment: a curated snapshot AND a full table mirror
// for the explorer. 2016–2020 pairs with the 2020 Decennial for the Community Report; 2020–2024
// is the current view.
export const ACS_YEARS = ['2020', '2024'];

// Baseline for measuring change. The Census pairs 2015–2019 with 2020–2024 precisely because the
// two windows share no years — 2016–2020 and 2020–2024 both contain 2020, and the Bureau's
// guidance is "do not compare overlapping datasets". Curated fetch only; no mirror, since the
// explorer doesn't surface this vintage.
export const COMPARE_YEAR = '2019';

// Multiply 2015–2019 dollar figures by this to state them in 2024 dollars. Published by the
// Census Bureau for exactly this pair of datasets:
// https://www.census.gov/programs-surveys/acs/guidance/comparing-acs-data/2024.html
// "dollar value estimates from the 2015-2019 file should be multiplied by 1.23070782 to convert
// 2019 dollars to 2024 dollars."
export const COMPARE_INFLATION_FACTOR = 1.23070782;

// ACS 5-year dollar figures are expressed in the final year's dollars, so comparing vintages
// without adjusting mixes price levels. These are the snapshot fields that carry dollars.
export const DOLLAR_SNAPSHOT_FIELDS = [
  'medianHouseholdIncome', 'perCapitaIncome', 'medianHomeValue', 'medianGrossRent',
];

// Fields that are already percentages. A relative change on a percentage misleads badly: poverty
// moving 3.2% -> 4.7% is +1.5 percentage points, but as a relative change it reads "+47%", which
// sounds like a catastrophe and is the kind of number that gets quoted. Rates report points.
export const RATE_SNAPSHOT_FIELDS = ['ownerOccupiedPct', 'unemploymentRate', 'povertyRate'];

// Neither a count nor a dollar nor a rate — a relative percentage of an age means nothing.
export const LEVEL_SNAPSHOT_FIELDS = ['medianAge'];

// Medians cannot be summed across tracts; a population-weighted average approximates them.
export const MEDIAN_VARS = new Set([
  'B19013_001E', // Median Household Income
  'B25064_001E', // Median Gross Rent
  'B25077_001E', // Median Home Value
  'B19301_001E', // Per Capita Income
  'B01002_001E', 'B01002_002E', 'B01002_003E', // Median Age (total / male / female)
  'B19019_001E', 'B19019_002E', 'B19019_003E', 'B19019_004E',
  'B19019_005E', 'B19019_006E', 'B19019_007E', 'B19019_008E', // Median income by household size
]);

export const GROUPS = {
  age: {
    label: 'Age Distribution',
    totalKey: 'B01001_001E',
    variables: {
      'B01001_001E': 'Total Population',
      'B01001_002E': 'Male - Total',
      'B01001_003E': 'Male - Under 5 years',
      'B01001_004E': 'Male - 5 to 9 years',
      'B01001_005E': 'Male - 10 to 14 years',
      'B01001_006E': 'Male - 15 to 17 years',
      'B01001_007E': 'Male - 18 to 19 years',
      'B01001_008E': 'Male - 20 years',
      'B01001_009E': 'Male - 21 years',
      'B01001_010E': 'Male - 22 to 24 years',
      'B01001_011E': 'Male - 25 to 29 years',
      'B01001_012E': 'Male - 30 to 34 years',
      'B01001_013E': 'Male - 35 to 39 years',
      'B01001_014E': 'Male - 40 to 44 years',
      'B01001_015E': 'Male - 45 to 49 years',
      'B01001_016E': 'Male - 50 to 54 years',
      'B01001_017E': 'Male - 55 to 59 years',
      'B01001_018E': 'Male - 60 to 61 years',
      'B01001_019E': 'Male - 62 to 64 years',
      'B01001_020E': 'Male - 65 to 66 years',
      'B01001_021E': 'Male - 67 to 69 years',
      'B01001_022E': 'Male - 70 to 74 years',
      'B01001_023E': 'Male - 75 to 79 years',
      'B01001_024E': 'Male - 80 to 84 years',
      'B01001_025E': 'Male - 85 years and over',
      'B01001_026E': 'Female - Total',
      'B01001_027E': 'Female - Under 5 years',
      'B01001_028E': 'Female - 5 to 9 years',
      'B01001_029E': 'Female - 10 to 14 years',
      'B01001_030E': 'Female - 15 to 17 years',
      'B01001_031E': 'Female - 18 to 19 years',
      'B01001_032E': 'Female - 20 years',
      'B01001_033E': 'Female - 21 years',
      'B01001_034E': 'Female - 22 to 24 years',
      'B01001_035E': 'Female - 25 to 29 years',
      'B01001_036E': 'Female - 30 to 34 years',
      'B01001_037E': 'Female - 35 to 39 years',
      'B01001_038E': 'Female - 40 to 44 years',
      'B01001_039E': 'Female - 45 to 49 years',
      'B01001_040E': 'Female - 50 to 54 years',
      'B01001_041E': 'Female - 55 to 59 years',
      'B01001_042E': 'Female - 60 to 61 years',
      'B01001_043E': 'Female - 62 to 64 years',
      'B01001_044E': 'Female - 65 to 66 years',
      'B01001_045E': 'Female - 67 to 69 years',
      'B01001_046E': 'Female - 70 to 74 years',
      'B01001_047E': 'Female - 75 to 79 years',
      'B01001_048E': 'Female - 80 to 84 years',
      'B01001_049E': 'Female - 85 years and over',
      'B01002_001E': 'Median Age (total)',
      'B01002_002E': 'Median Age (male)',
      'B01002_003E': 'Median Age (female)',
    },
  },
  income: {
    label: 'Household Income',
    totalKey: 'B19001_001E',
    variables: {
      'B19001_001E': 'Total Households',
      'B19001_002E': 'Less than $10,000',
      'B19001_003E': '$10,000 to $14,999',
      'B19001_004E': '$15,000 to $19,999',
      'B19001_005E': '$20,000 to $24,999',
      'B19001_006E': '$25,000 to $29,999',
      'B19001_007E': '$30,000 to $34,999',
      'B19001_008E': '$35,000 to $39,999',
      'B19001_009E': '$40,000 to $44,999',
      'B19001_010E': '$45,000 to $49,999',
      'B19001_011E': '$50,000 to $59,999',
      'B19001_012E': '$60,000 to $74,999',
      'B19001_013E': '$75,000 to $99,999',
      'B19001_014E': '$100,000 to $124,999',
      'B19001_015E': '$125,000 to $149,999',
      'B19001_016E': '$150,000 to $199,999',
      'B19001_017E': '$200,000 or more',
      'B19013_001E': 'Median Household Income ($)',
      'B19025_001E': 'Aggregate Household Income ($)',
      'B19301_001E': 'Per Capita Income ($)',
    },
  },
  incomeBySize: {
    label: 'Income by Household Size',
    totalKey: 'B19019_001E',
    variables: {
      'B19019_001E': 'Median household income — All households',
      'B19019_002E': 'Median household income — 1-person households',
      'B19019_003E': 'Median household income — 2-person households',
      'B19019_004E': 'Median household income — 3-person households',
      'B19019_005E': 'Median household income — 4-person households',
      'B19019_006E': 'Median household income — 5-person households',
      'B19019_007E': 'Median household income — 6-person households',
      'B19019_008E': 'Median household income — 7-or-more-person households',
    },
  },
  householdSize: {
    label: 'Household Size (by tenure)',
    totalKey: 'B25009_001E',
    variables: {
      'B25009_001E': 'Total occupied units',
      'B25009_002E': 'Owner-occupied',
      'B25009_003E': 'Owner: 1-person', 'B25009_004E': 'Owner: 2-person',
      'B25009_005E': 'Owner: 3-person', 'B25009_006E': 'Owner: 4-person',
      'B25009_007E': 'Owner: 5-person', 'B25009_008E': 'Owner: 6-person',
      'B25009_009E': 'Owner: 7-or-more-person',
      'B25009_010E': 'Renter-occupied',
      'B25009_011E': 'Renter: 1-person', 'B25009_012E': 'Renter: 2-person',
      'B25009_013E': 'Renter: 3-person', 'B25009_014E': 'Renter: 4-person',
      'B25009_015E': 'Renter: 5-person', 'B25009_016E': 'Renter: 6-person',
      'B25009_017E': 'Renter: 7-or-more-person',
    },
  },
  race: {
    label: 'Race & Ethnicity',
    totalKey: 'B02001_001E',
    variables: {
      'B02001_001E': 'Total Population',
      'B02001_002E': 'White alone',
      'B02001_003E': 'Black or African American alone',
      'B02001_004E': 'American Indian and Alaska Native alone',
      'B02001_005E': 'Asian alone',
      'B02001_006E': 'Native Hawaiian and Pacific Islander alone',
      'B02001_007E': 'Some other race alone',
      'B02001_008E': 'Two or more races',
      'B02001_009E': 'Two or more races: two races incl. Some other',
      'B02001_010E': 'Two or more races: two races excl. Some other, and three or more',
      'B03003_001E': 'Total Population (Hispanic origin)',
      'B03003_002E': 'Not Hispanic or Latino',
      'B03003_003E': 'Hispanic or Latino (of any race)',
    },
  },
  education: {
    label: 'Educational Attainment (25+)',
    totalKey: 'B15003_001E',
    variables: {
      'B15003_001E': 'Total Population 25+',
      'B15003_002E': 'No schooling completed',
      'B15003_003E': 'Nursery school',
      'B15003_004E': 'Kindergarten',
      'B15003_005E': '1st grade',
      'B15003_006E': '2nd grade',
      'B15003_007E': '3rd grade',
      'B15003_008E': '4th grade',
      'B15003_009E': '5th grade',
      'B15003_010E': '6th grade',
      'B15003_011E': '7th grade',
      'B15003_012E': '8th grade',
      'B15003_013E': '9th grade',
      'B15003_014E': '10th grade',
      'B15003_015E': '11th grade',
      'B15003_016E': '12th grade, no diploma',
      'B15003_017E': 'Regular high school diploma',
      'B15003_018E': 'GED or alternative credential',
      'B15003_019E': 'Some college, less than 1 year',
      'B15003_020E': 'Some college, 1+ years, no degree',
      'B15003_021E': "Associate's degree",
      'B15003_022E': "Bachelor's degree",
      'B15003_023E': "Master's degree",
      'B15003_024E': 'Professional school degree',
      'B15003_025E': 'Doctorate degree',
    },
  },
  employment: {
    label: 'Employment Status (16+)',
    totalKey: 'B23025_001E',
    variables: {
      'B23025_001E': 'Total Population 16+',
      'B23025_002E': 'In labor force',
      'B23025_003E': 'Civilian labor force',
      'B23025_004E': 'Employed',
      'B23025_005E': 'Unemployed',
      'B23025_006E': 'Armed Forces',
      'B23025_007E': 'Not in labor force',
    },
  },
  housing: {
    label: 'Housing',
    totalKey: 'B25001_001E',
    variables: {
      'B25001_001E': 'Total Housing Units',
      'B25002_002E': 'Occupied units',
      'B25002_003E': 'Vacant units',
      'B25003_002E': 'Owner-occupied',
      'B25003_003E': 'Renter-occupied',
      'B25004_002E': 'Vacant: for rent',
      'B25004_004E': 'Vacant: for sale only',
      'B25004_006E': 'Vacant: seasonal/recreational/occasional use',
      'B25024_002E': '1-unit, detached',
      'B25024_003E': '1-unit, attached',
      'B25024_004E': '2 units',
      'B25024_005E': '3 or 4 units',
      'B25024_006E': '5 to 9 units',
      'B25024_007E': '10 to 19 units',
      'B25024_008E': '20 to 49 units',
      'B25024_009E': '50 or more units',
      'B25024_010E': 'Mobile home',
      'B25034_002E': 'Built 2020 or later',
      'B25034_003E': 'Built 2010 to 2019',
      'B25034_004E': 'Built 2000 to 2009',
      'B25034_005E': 'Built 1990 to 1999',
      'B25034_006E': 'Built 1980 to 1989',
      'B25034_007E': 'Built 1970 to 1979',
      'B25034_008E': 'Built 1960 to 1969',
      'B25034_009E': 'Built 1950 to 1959',
      'B25034_010E': 'Built 1940 to 1949',
      'B25034_011E': 'Built 1939 or earlier',
      'B25064_001E': 'Median Gross Rent ($)',
      'B25077_001E': 'Median Home Value ($)',
    },
  },
  poverty: {
    label: 'Poverty Status',
    totalKey: 'B17001_001E',
    variables: {
      'B17001_001E': 'Total Population (poverty determination)',
      'B17001_002E': 'Below poverty level - Total',
      'B17001_031E': 'At or above poverty level - Total',
      'B17001_003E': 'Below poverty - Male, under 5',
      'B17001_004E': 'Below poverty - Male, 5',
      'B17001_005E': 'Below poverty - Male, 6 to 11',
      'B17001_006E': 'Below poverty - Male, 12 to 14',
      'B17001_007E': 'Below poverty - Male, 15 to 17',
      'B17001_008E': 'Below poverty - Male, 18 to 24',
      'B17001_009E': 'Below poverty - Male, 25 to 34',
      'B17001_010E': 'Below poverty - Male, 35 to 44',
      'B17001_011E': 'Below poverty - Male, 45 to 54',
      'B17001_012E': 'Below poverty - Male, 55 to 64',
      'B17001_013E': 'Below poverty - Male, 65 to 74',
      'B17001_014E': 'Below poverty - Male, 75 and over',
      'B17001_017E': 'Below poverty - Female, under 5',
      'B17001_018E': 'Below poverty - Female, 5',
      'B17001_019E': 'Below poverty - Female, 6 to 11',
      'B17001_020E': 'Below poverty - Female, 12 to 14',
      'B17001_021E': 'Below poverty - Female, 15 to 17',
      'B17001_022E': 'Below poverty - Female, 18 to 24',
      'B17001_023E': 'Below poverty - Female, 25 to 34',
      'B17001_024E': 'Below poverty - Female, 35 to 44',
      'B17001_025E': 'Below poverty - Female, 45 to 54',
      'B17001_026E': 'Below poverty - Female, 55 to 64',
      'B17001_027E': 'Below poverty - Female, 65 to 74',
      'B17001_028E': 'Below poverty - Female, 75 and over',
    },
  },
};
