// Single source of truth for Kimura Kostay's real-world details.
export const HOTEL = {
  name: 'Kimura Kostay',
  fullName: 'Kimura Kostay Semarang',
  address: 'Jl. Brigjen Sudiarto No. 116, Pandean Lamper, Gayamsari, Semarang, Jawa Tengah 50167',
  addressShort: 'Gayamsari, Semarang',
  lat: -6.9986703,
  lng: 110.4430829,
  phone: '+6282177225800',
  phoneDisplay: '+62 821-7722-5800',
  whatsapp: '6282177225800',
  email: 'rsv@kimurakostay.com',
  checkIn: '14:00',
  checkOut: '12:00',
  mapsUrl: 'https://maps.app.goo.gl/XDb8dYMk97ojvtC58',
  cloudbedsUrl: 'https://hotels.cloudbeds.com/en/reservation/EdAnNO/?currency=idr',
} as const;

export function whatsappLink(message: string): string {
  return `https://wa.me/${HOTEL.whatsapp}?text=${encodeURIComponent(message)}`;
}
