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

export interface SloohSatellite {
  satelliteId: string | null
  satelliteUUID: string | null
  providerId: string | null
  providerUUID: string | null
  provider: string | null
  providerName: string | null
  providerHomeURL: string | null
  providerLogoURL: string | null
  shortName: string | null
  name: string | null
  iconURL: string | null
  type: string | null
  online: boolean
  onlineMessage: string | null
  trackerIframeURL: string | null
  trackerAspect: string | null
}

export interface SloohSatImage {
  customerImageId: number | null
  missionId: string | null
  orderUUID: string | null
  providerName: string | null
  satelliteName: string | null
  missionName: string | null
  caption: string | null
  downloadURL: string | null
  viewURL: string | null
  thumbnailURL: string | null
  shareToken: string | null
  canShare: boolean
}

export interface SloohSatArchiveItem {
  archiveId: string | null
  centerLatDeg: number | null
  centerLongDeg: number | null
  searchFromDate: string | null
  searchThroughDate: string | null
  aoiPolygonWKT: string | null
  footprintPolygonWKT: string | null
  thumbnailURL: string | null
  captureDateTimeText: string | null
  captureDateTimestamp: number | null
}

export interface SloohSatMission {
  type: "satellite" | "telescope"
  uniqueId: string
  scheduledMissionId: number
  satelliteIconURL: string | null
  userReservationType: string | null
  missionStart: number | null
  displayDateTime: string | null
  displayDate: string | null
  displayTime: string | null
  displayTimeZone: string | null
  title: string | null
  statusText: string | null
  snapCount: number
  orderId: string | null
  geoName: string | null
  latitude: number | null
  latDirection: string | null
  longitude: number | null
  longDirection: string | null
  areaSqKmRequested: number | null
  satelliteCaptureFormatted: string | null
  expectDeliveryBy: string | null
  wxConditionText: string | null
  skyConditionText: string | null
  formattedStartTime: string | null
  showCancelMissionMenu: boolean
}

export interface SloohAccountLimits {
  allowMissionReservation: boolean
  showMissions: boolean
  missionQuota: { maxCount: number; inUseCount: number; availableCount: number }
  missionsQuotaMsg: string | null
  showAdvancedMissions: boolean
  allowAdvancedMissionReservation: boolean
  advancedMissionQuota: {
    maxCount: number
    inUseCount: number
    availableCount: number
  }
}

export interface SloohAccount {
  permissions: {
    canScheduleMissions: boolean
    canScheduleSatelliteMissions: boolean
    canAccessAdvancedMissions: boolean
  }
  limits: SloohAccountLimits | null
}

export interface SloohAlert {
  eventId: number
  isNewEvent: boolean
  active: boolean
  eventLabel: string | null
  eventTitle: string | null
  imageAuthor: string | null
  hasLink: boolean
  linkLabel: string | null
  linkUrl: string | null
  canDismiss: boolean
}

export interface SloohSky {
  timestamp: number
  obsId: string
  obsName: string
  widgets: {
    seeing: {
      observedAt: number | null
      online: boolean
      refreshIntervalSec: number | null
      index: number | null
      description: string | null
      color: string | null
    } | null
    allSkyCamera: { title: string | null; url: string | null } | null
    domeCamera: { title: string | null; url: string | null } | null
    facilityWebcam: { title: string | null; url: string | null } | null
    dayNightBar: {
      url: string | null
      raw: {
        currenTimeFormatted?: string
        sunsetTime?: string
        sunriseTime?: string
        domesOpenTime?: string
        missionStartTime?: string
        missionEndTime?: string
        astroTwilightStartTime?: string
        astroTwilightEndTime?: string
      } | null
    } | null
    dayNightMap: { url: string | null } | null
    missionControl: {
      title: string | null
      content: string | null
      contentText: string | null
      url: string | null
    } | null
  }
}

export interface SloohRecommend {
  object: {
    objectId: string
    objectTitle: string | null
    objectType: string | null
    objectRA: number | null
    objectDec: number | null
    objectIconURL: string | null
  } | null
  slot: {
    scheduledMissionId: number
    missionStart: number
    expires: number | null
    missionType: string | null
    teleUniqueId: string | null
    obsId: string | null
    domeId: number | null
    telescopeId: string | null
    obsName: string | null
    telescopeName: string | null
    pierName: string | null
  } | null
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
  domeId: number
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
