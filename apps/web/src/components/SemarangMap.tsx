import { Map, MapMarker, MarkerContent, MarkerPopup } from '@/components/ui/map';
import { HOTEL } from '@kimura/core/hotel';

interface Props {
  className?: string;
  lat?: number;
  lng?: number;
  name?: string;
  address?: string;
}

// MapLibre order is [lng, lat]. Defaults keep the map renderable before
// property settings load (client:only islands render before data arrives).
export default function SemarangMap({ className, lat = HOTEL.lat, lng = HOTEL.lng, name = HOTEL.name, address = HOTEL.addressShort }: Props) {
  return (
    <Map
      viewport={{ center: [lng, lat], zoom: 15 }}
      className={className ?? 'h-[420px] w-full rounded-xl border border-border'}
    >
      <MapMarker longitude={lng} latitude={lat}>
        <MarkerContent>
          <div className="relative flex items-center justify-center">
            <span className="absolute size-8 animate-ping rounded-full bg-[oklch(0.62_0.105_52)] opacity-30" />
            <span className="relative flex size-5 items-center justify-center rounded-full bg-[oklch(0.62_0.105_52)] text-[10px] font-bold text-white shadow-lg ring-2 ring-white">
              木
            </span>
          </div>
        </MarkerContent>
        <MarkerPopup>
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
            <p className="font-display text-sm font-semibold text-card-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">{address}</p>
          </div>
        </MarkerPopup>
      </MapMarker>
    </Map>
  );
}
