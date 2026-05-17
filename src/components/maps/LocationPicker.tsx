'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix the broken default-marker URLs that webpack's bundler can't
// resolve. Pinning to the CDN keeps the markers visible regardless of
// how the bundler treats leaflet's relative image paths.
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

// When the parent's lat/lng changes (e.g. user typed in the text box or
// hit "ใช้ตำแหน่งปัจจุบัน") pan the map to follow. Without this the pin
// jumps to the new spot but the viewport stays where the user dragged
// it last, which is jarring.
function FollowCenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng])
    }
  }, [lat, lng, map])
  return null
}

export default function LocationPicker({
  lat, lng, radius, onPick,
}: {
  lat: number
  lng: number
  radius: number
  onPick: (lat: number, lng: number) => void
}) {
  const center: [number, number] = [
    Number.isFinite(lat) ? lat : 13.7563,
    Number.isFinite(lng) ? lng : 100.5018,
  ]
  return (
    <MapContainer
      center={center}
      zoom={16}
      scrollWheelZoom={true}
      style={{ height: 320, width: '100%', borderRadius: 8, zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={center} />
      <Circle
        center={center}
        radius={radius}
        pathOptions={{ color: '#1D9E75', fillColor: '#1D9E75', fillOpacity: 0.15, weight: 2 }}
      />
      <ClickPicker onPick={onPick} />
      <FollowCenter lat={center[0]} lng={center[1]} />
    </MapContainer>
  )
}
