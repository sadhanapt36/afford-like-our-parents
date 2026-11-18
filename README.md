# Can We Afford to Live Like Our Parents Did?

An explorable explanation of housing affordability across generations. Pick the year your
parents turned 22 and the city you live in, and see how home prices, rent, and income have
changed since then.

**Live site:** https://sadhanapt36.github.io/afford-like-our-parents/

DSC 106 Final Project (UC San Diego, Fall 2026) · Built with D3.js

## Files

- `index.html`, `style.css`, `main.js`: the page (D3 v7 loaded from jsDelivr)
- `data/metros.csv`: ACS 1-year estimates for 414 metro areas, 2005–2025
- `data/national.csv`: FRED national series, 1984–2025
- `prep_data.py`: builds the two CSVs from the raw downloads in `../final-project-proposal/data`

## Data sources

- U.S. Census Bureau, American Community Survey 1-year estimates: B19013, B25064, B25077, B25071, B01003
- FRED: MSPUS, MEHOINUSA646N, CUUR0000SEHA, CPIAUCSL
