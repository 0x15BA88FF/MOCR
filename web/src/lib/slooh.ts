export interface SloohObject {
  name: string | null
  description: string | null
  audioURL: string | null
  type: string | null
  constellation: string | null
  ra: number | null
  dec: number | null
  sizeArcSeconds: number | null
  magnitude: string | null
  distance: string | null
  coordinatesDisplay: string | null
  altAz: { altitude: number; azimuth: number } | null
}

export interface SloohSite {
  name: string | null
  latitude: number | null
  longitude: number | null
  elevationM: number | null
}

export interface SloohTelescope extends SloohSite {
  obsId: string
  obsName: string
  telescopeId: string
  teleUniqueId: string
  telescopeName: string
  online: boolean
  status: string
  feedType: "video" | "sse" | null
  streamCode: string | null
  streamURL: string | null
  currentImgURL: string | null
  mission: {
    imageID: string | null
    scheduledMissionID: string | null
    astroObjectID: string | null
    serverTime: number | null
  }
  object: SloohObject | null
}
