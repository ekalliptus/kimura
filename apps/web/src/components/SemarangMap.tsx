import { Map, MapMarker, MarkerContent, MarkerPopup } from '@/components/ui/map';

// Kimura Kostay, Semarang. MapLibre order is [lng, lat].
const LNG = 110.4430829;
const LAT = -6.9986703;

export default function SemarangMap({ className }: { className?: string }) {
  return (
    <Map
      viewport={{ center: [LNG, LAT], zoom: 15 }}
      className={className ?? 'h-[420px] w-full rounded-xl border border-border'}
    >
      <MapMarker longitude={LNG} latitude={LAT}>
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
            <p className="font-display text-sm font-semibold text-card-foreground">Kimura Kostay</p>
            <p className="text-xs text-muted-foreground">Jl. Brigjen Sudiarto No. 116</p>
          </div>
        </MarkerPopup>
      </MapMarker>
    </Map>
  );
}
