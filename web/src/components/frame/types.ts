export type ViewState = {
  zoom: number
  offsetX: number
  offsetY: number
}

export type Size = {
  width: number
  height: number
}

export interface FrameMeta {
  url: string
  imageID?: string
  astroObjectID?: string
  scheduledMissionID?: string
  missionTitle?: string | null
}

export interface MissionMeta {
  imageID?: string | null
  astroObjectID?: string | null
  scheduledMissionID?: string | null
  missionTitle?: string | null
  serverTime?: number | null
}
