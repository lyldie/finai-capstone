# OCR Receipt Scanner Notes

## Current approach
- The backend uses a dual-engine OCR flow for receipts.
- First, it runs EasyOCR locally on the uploaded receipt image.
- Then, if needed, it runs Gemini 2.0 Flash as a fallback to improve extraction quality.
- The system chooses the stronger result between the two engines to improve consistency.

## What is improved
- Total amount selection now prefers the final total rather than the first visible number.
- Merchant detection is more conservative and avoids obvious noise.
- Date parsing now handles missing years by using the current year as a fallback.
- Gemini parsing is more structured and normalized to reduce malformed outputs.

## Testing checklist
- Test printed receipts with clear totals and dates.
- Test handwritten receipts with missing years.
- Test long receipts that span multiple frames.
- Compare the returned amount, merchant, date, and category across multiple runs.
- Record cases where the OCR is incorrect so the rules can be refined further.
