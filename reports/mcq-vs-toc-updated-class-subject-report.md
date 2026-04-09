# MCQ vs TOC_updated Class-Subject Report

Generated on 2026-04-09

Source of truth:
- `TOC_updated.xlsx`
- `supabase/seed/TOC_updated.xlsx`

These two files are byte-identical. This report compares `MCQ/` against `TOC_updated.xlsx` class-by-class and subject-by-subject for classes 6-12 only, because MCQs are expected to start from class 6.

## Summary

- Scopes where MCQ has chapters beyond TOC: `10`
- Extra MCQ chapter numbers found: `16`
- Scopes where TOC has chapters but MCQ is missing them: `2`
- Missing MCQ chapter numbers: `23`
- Unnumbered MCQ files that could not be matched by chapter number: `46`

## Class Summary

- Class 6: `1` extra scope, `0` missing scopes
- Class 7: `3` extra scopes, `0` missing scopes
- Class 8: `1` extra scope, `0` missing scopes
- Class 9: `2` extra scopes, `0` missing scopes
- Class 10: `1` extra scope, `0` missing scopes
- Class 11: `1` extra scope, `1` missing scope
- Class 12: `1` extra scope, `1` missing scope

## Chapters Present In MCQ But Beyond TOC_updated

- Class 6 > History: `12`
- Class 7 > Civics: `10`
- Class 7 > Geography: `10`
- Class 7 > Science: `19`
- Class 8 > History: `11, 12`
- Class 9 > Civics: `6`
- Class 9 > History: `6, 7, 8`
- Class 10 > History: `6, 7, 8`
- Class 11 > Accountancy: `14, 15`
- Class 12 > Business Studies: `13`

## Chapters Present In TOC_updated But Missing In MCQ

- Class 11 > Computer: `1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14`
- Class 12 > Political Science: `10, 11, 12, 13, 14, 15, 16, 17, 18`

## Unnumbered MCQ Files Needing Manual Mapping

- Class 12 > Chemistry: `25` files
  Sample:
  - `MCQ/Hindi/12/Chemistry/Chemistry_12_Alcohols, Phenols and Ethers (II).xlsx`
  - `MCQ/Hindi/12/Chemistry/Chemistry_12_Alcohols, Phenols and Ethers.xlsx`
  - `MCQ/Hindi/12/Chemistry/Chemistry_12_Aldehydes, Ketones and Carboxylic acids-(I).xlsx`
- Class 12 > Physics: `21` files
  Sample:
  - `MCQ/Hindi/12/Physics/Physics_12_Alternating current-I.xlsx`
  - `MCQ/Hindi/12/Physics/Physics_12_Alternating current-II.xlsx`
  - `MCQ/Hindi/12/Physics/Physics_12_Atoms.xlsx`

## Notes

- `TOC_updated.xlsx` is bilingual, not medium-separated, so this comparison intentionally ignores medium and compares by `Class > Subject > Chapter Number`.
- The earlier medium-based MCQ gap report can overcount Hindi-side mismatches because the TOC stores English and Hindi titles in the same row.
