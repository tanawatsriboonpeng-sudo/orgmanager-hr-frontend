// Centralized dayjs configuration. Imported as a side-effect from
// app/layout.tsx so the locale + plugins are wired up before any
// component renders.
//
// What this gives the rest of the app:
//   - Thai month/day names ("พฤษภาคม", "จันทร์") via the th locale
//   - Buddhist Era tokens BBBB / BBYY for Thai-style year display
//     (2569 instead of 2026)
//   - 24h Thai-flavored time format (HH:mm) is just dayjs default —
//     keep using 'HH:mm' / 'HH:mm:ss' in callsites
//
// Format-string convention used across the codebase after this:
//   - 'YYYY-MM-DD'                — internal date KEY (queries,
//                                    URL params, DB lookups). LEAVE
//                                    AS GREGORIAN — never localize.
//   - 'D MMM BBBB', 'D MMMM BBBB' — user-facing display, Buddhist
//                                    year (e.g. "18 พ.ค. 2569")
//   - 'D MMM BBYY'                — short display ("18 พ.ค. 69")
//   - 'BBBB'                       — Buddhist year only
//   - 'HH:mm'                      — 24h time
import dayjs from 'dayjs'
import 'dayjs/locale/th'
import buddhistEra from 'dayjs/plugin/buddhistEra'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(buddhistEra)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)
dayjs.locale('th')

export default dayjs
