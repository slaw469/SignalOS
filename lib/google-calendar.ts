import { google, calendar_v3 } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

export function getAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function refreshAccessToken(refreshToken: string) {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

function getCalendarClient(accessToken: string): calendar_v3.Calendar {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

export async function getCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = getCalendarClient(accessToken);
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });
  return res.data.items ?? [];
}

export async function createCalendarEvent(
  accessToken: string,
  eventDetails: {
    title: string;
    start_time: string;
    end_time: string;
    description?: string;
    location?: string;
  }
): Promise<calendar_v3.Schema$Event> {
  const calendar = getCalendarClient(accessToken);
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: eventDetails.title,
      description: eventDetails.description,
      location: eventDetails.location,
      start: { dateTime: eventDetails.start_time },
      end: { dateTime: eventDetails.end_time },
    },
  });
  return res.data;
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  updates: {
    title?: string;
    start_time?: string;
    end_time?: string;
    description?: string;
  }
): Promise<calendar_v3.Schema$Event> {
  const calendar = getCalendarClient(accessToken);
  const requestBody: calendar_v3.Schema$Event = {};
  if (updates.title) requestBody.summary = updates.title;
  if (updates.description) requestBody.description = updates.description;
  if (updates.start_time) requestBody.start = { dateTime: updates.start_time };
  if (updates.end_time) requestBody.end = { dateTime: updates.end_time };

  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody,
  });
  return res.data;
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const calendar = getCalendarClient(accessToken);
  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
}
