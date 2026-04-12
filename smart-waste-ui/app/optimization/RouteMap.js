"use client";
import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';

function MapUpdater({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  }, [bounds, map]);
  return null;
}

export default function RouteMap({ route }) {
  if (!route || route.length === 0) {
    return (
      <MapContainer center={[30.3160, 78.0300]} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    );
  }

  const positions = route.map(node => [node.lat, node.lng]);

  return (
    <MapContainer center={positions[0]} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {route.map((node, i) => (
        <Marker key={i} position={[node.lat, node.lng]}>
          <Popup>
            <div className="text-center w-32">
              <strong className="block text-slate-800">{node.stop}</strong>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{node.reason}</span>
            </div>
          </Popup>
        </Marker>
      ))}

      <Polyline positions={positions} pathOptions={{ color: '#10b981', weight: 5, dashArray: '10, 10' }} />
      <MapUpdater bounds={positions} />
    </MapContainer>
  );
}
