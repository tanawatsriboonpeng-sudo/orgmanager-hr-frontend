'use client'
import { useEffect, useState, useCallback } from 'react'
import { attendanceApi } from '@/lib/api'
import { IconMapPin, IconClockCheck, IconClockOff, IconAlertTriangle, IconCheck } from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  present: { label: 'ตรงเวลา', cls: 'badge-green' },
  late:    { label: 'สาย', cls: 'badge-amber' },
  absent:  { label: 'ขาด', cls: 'badge-red' },
  leave:   { label: 'ลา', cls: 'badge-purple' },
  holiday: { label: 'วันหยุด', cls: 'badge-gray' },
}

export default function AttendancePage() {
  const [todayLog, setTodayLog] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [locStatus, setLocStatus] = useState<'idle' | 'getting' | 'ok' | 'denied' | 'far'>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [distance, setDistance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const [todayRes, histRes] = await Promise.allSettled([
      attendanceApi.today(),
      attendanceApi.myHistory(),
    ])
    if (todayRes.status === 'fulfilled') setTodayLog(todayRes.value.data.data)
    if (histRes.status === 'fulfilled') setHistory(histRes.value.data.data?.records || [])
  }, [])

  useEffect(() => { load() }, [load])

  const getLocation = () => {
    setLocStatus('getting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocStatus('ok')
      },
      () => setLocStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const doCheckIn = async () => {
    setLoading(true); setMsg('')
    try {
      const res = await attendanceApi.checkIn(coords?.lat, coords?.lng)
      setMsg(res.data.message)
      setDistance(res.data.data?.distance || null)
      await load()
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'เช็คอินไม่สำเร็จ')
      setDistance(e.response?.data?.data?.distance || null)
    } finally { setLoading(false) }
  }

  const doCheckOut = async () => {
    setLoading(true); setMsg('')
    try {
      const res = await attendanceApi.checkOut(coords?.lat, coords?.lng)
      setMsg(res.data.message)
      await load()
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'เช็คเอาท์ไม่สำเร็จ')
    } finally { setLoading(false) }
  }

  const canCheckIn = !todayLog?.check_in_at
  const canCheckOut = todayLog?.check_in_at && !todayLog?.check_out_at

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#111110]">ลงเวลาทำงาน</h1>
        <p className="text-sm text-gray-500 mt-0.5">{dayjs().format('dddd D MMMM YYYY')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Check-in card */}
        <div className="card">
          <h2 className="text-sm font-semibold text-[#111110] mb-4">เช็คอิน / เช็คเอาท์</h2>

          {/* Today status */}
          {todayLog && (
            <div className="p-3 bg-[#E1F5EE]/60 rounded-[10px] mb-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-600">เวลาเข้า</span>
                <span className="font-medium">{dayjs(todayLog.check_in_at).format('HH:mm น.')}</span>
              </div>
              {todayLog.check_out_at && (
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">เวลาออก</span>
                  <span className="font-medium">{dayjs(todayLog.check_out_at).format('HH:mm น.')}</span>
                </div>
              )}
              {todayLog.work_hours && (
                <div className="flex justify-between">
                  <span className="text-gray-600">ชั่วโมงทำงาน</span>
                  <span className="font-medium">{Number(todayLog.work_hours).toFixed(1)} ชม.</span>
                </div>
              )}
              {todayLog.status && (
                <div className="flex justify-between mt-2 pt-2 border-t border-[#1D9E75]/20">
                  <span className="text-gray-600">สถานะ</span>
                  <span className={clsx('badge', STATUS_MAP[todayLog.status]?.cls || 'badge-gray')}>
                    {STATUS_MAP[todayLog.status]?.label || todayLog.status}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* GPS */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">ตำแหน่ง GPS</span>
              {distance !== null && (
                <span className={clsx('text-xs font-medium', distance <= 60 ? 'text-[#085041]' : 'text-red-600')}>
                  ระยะ {distance} ม. {distance <= 60 ? '✓' : '(ไกลเกิน)'}
                </span>
              )}
            </div>
            <button
              onClick={getLocation}
              className={clsx('btn w-full justify-center text-sm', locStatus === 'ok' && 'border-[#1D9E75]/40 text-[#085041]')}
            >
              <IconMapPin size={15} />
              {locStatus === 'idle' && 'เปิด GPS'}
              {locStatus === 'getting' && 'กำลังระบุตำแหน่ง...'}
              {locStatus === 'ok' && `ตำแหน่งพร้อมแล้ว (${coords?.lat.toFixed(4)}, ${coords?.lng.toFixed(4)})`}
              {locStatus === 'denied' && 'ไม่ได้รับอนุญาต GPS'}
            </button>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={doCheckIn}
              disabled={!canCheckIn || loading || locStatus !== 'ok'}
              className="btn btn-primary justify-center py-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconClockCheck size={16} />
              เช็คอิน
            </button>
            <button
              onClick={doCheckOut}
              disabled={!canCheckOut || loading || locStatus !== 'ok'}
              className="btn justify-center py-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconClockOff size={16} />
              เช็คเอาท์
            </button>
          </div>

          {msg && (
            <div className={clsx('mt-3 p-2.5 rounded-[8px] text-xs flex items-center gap-2',
              msg.includes('ไม่') || msg.includes('นอก')
                ? 'bg-red-50 text-red-600'
                : 'bg-[#E1F5EE] text-[#085041]'
            )}>
              {msg.includes('ไม่') ? <IconAlertTriangle size={13} /> : <IconCheck size={13} />}
              {msg}
            </div>
          )}
        </div>

        {/* Monthly summary */}
        <div className="card">
          <h2 className="text-sm font-semibold text-[#111110] mb-4">สรุปเดือนนี้</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'มาทำงาน', value: history.filter(r => r.status === 'present').length, color: '#1D9E75' },
              { label: 'มาสาย', value: history.filter(r => r.status === 'late').length, color: '#BA7517' },
              { label: 'ขาดงาน', value: history.filter(r => r.status === 'absent').length, color: '#E24B4A' },
              { label: 'ลางาน', value: history.filter(r => r.status === 'leave').length, color: '#534AB7' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 rounded-[10px] p-3 text-center">
                <div className="text-2xl font-semibold" style={{ color }}>{value}</div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="card">
        <h2 className="text-sm font-semibold text-[#111110] mb-4">ประวัติลงเวลา</h2>
        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มีประวัติ</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  {['วันที่','เวลาเข้า','เวลาออก','ชั่วโมง','สถานะ'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 15).map((r: any) => (
                  <tr key={r.id} className="border-b border-black/[0.04] hover:bg-gray-50/60">
                    <td className="py-2.5 px-3 text-xs">{dayjs(r.date).format('D MMM')}</td>
                    <td className="py-2.5 px-3 text-xs">{r.check_in_at ? dayjs(r.check_in_at).format('HH:mm') : '—'}</td>
                    <td className="py-2.5 px-3 text-xs">{r.check_out_at ? dayjs(r.check_out_at).format('HH:mm') : '—'}</td>
                    <td className="py-2.5 px-3 text-xs">{r.work_hours ? `${Number(r.work_hours).toFixed(1)} ชม.` : '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className={clsx('badge', STATUS_MAP[r.status]?.cls || 'badge-gray')}>
                        {STATUS_MAP[r.status]?.label || r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
