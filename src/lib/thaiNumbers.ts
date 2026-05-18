// Thai-language number formatting utilities.
//
// bahtToThai(20000)     => "สองหมื่นบาทถ้วน"
// bahtToThai(15500)     => "หนึ่งหมื่นห้าพันห้าร้อยบาทถ้วน"
// bahtToThai(12500.50)  => "หนึ่งหมื่นสองพันห้าร้อยบาทห้าสิบสตางค์"
// bahtToThai(0)         => "ศูนย์บาทถ้วน"
//
// Used by /salary-certificate to print the salary in words on the
// formal letter ("เดือนละ 20,000 บาท (สองหมื่นบาทถ้วน)").
//
// Reading rules followed:
//   - หนึ่ง at the ones place AFTER any other digit becomes "เอ็ด"
//     (e.g., 11 = สิบเอ็ด, 21 = ยี่สิบเอ็ด, 101 = หนึ่งร้อยเอ็ด)
//   - สอง at the tens place becomes "ยี่" (e.g., 20 = ยี่สิบ)
//   - หนึ่ง at the tens place is dropped (e.g., 10 = สิบ, not "หนึ่งสิบ")
//   - Amounts ≥ 1,000,000 are split into "ล้าน" chunks recursively
//     so 1,500,000 reads "หนึ่งล้านห้าแสน" correctly.

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** Read a 1–6 digit chunk. `withPrefix` is true when this chunk follows
 *  a larger chunk (e.g., a million prefix), in which case a lone "1" at
 *  the ones place becomes "เอ็ด" instead of "หนึ่ง". */
function readChunk(n: number, withPrefix = false): string {
  if (n === 0) return ''
  const s = n.toString()
  const len = s.length
  let out = ''
  for (let i = 0; i < len; i++) {
    const d = parseInt(s[i], 10)
    const pos = len - 1 - i // 0=ones, 1=tens, 2=hundreds, ...
    if (d === 0) continue
    const hasPredecessor = i > 0 || withPrefix
    if (pos === 0 && hasPredecessor && d === 1) {
      out += 'เอ็ด'
    } else if (pos === 1 && d === 1) {
      out += 'สิบ'
    } else if (pos === 1 && d === 2) {
      out += 'ยี่สิบ'
    } else {
      out += DIGITS[d] + POSITIONS[pos]
    }
  }
  return out
}

/** Read the integer baht portion. Recurses on "ล้าน" so it handles
 *  amounts up to JS Number safe range, not just 999,999. */
function readInteger(n: number): string {
  if (n === 0) return 'ศูนย์'
  if (n < 1_000_000) return readChunk(n, false)
  const upper = Math.floor(n / 1_000_000)
  const lower = n % 1_000_000
  const upperWords = readInteger(upper) + 'ล้าน'
  if (lower === 0) return upperWords
  return upperWords + readChunk(lower, true)
}

/** Convert a baht amount to Thai words ("สองหมื่นบาทถ้วน"). */
export function bahtToThai(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  const negative = amount < 0
  const abs = Math.abs(amount)
  const baht = Math.floor(abs)
  // Round to nearest satang (2 decimal places).
  const satang = Math.round((abs - baht) * 100)

  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน'

  let out = ''
  if (baht > 0) out += readInteger(baht) + 'บาท'
  if (satang > 0) {
    if (baht === 0) out += 'ศูนย์บาท'
    out += readChunk(satang, false) + 'สตางค์'
  } else {
    out += 'ถ้วน'
  }
  return (negative ? 'ลบ' : '') + out
}
