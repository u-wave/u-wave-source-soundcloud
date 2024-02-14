import * as httpErrors from 'http-errors';
import fetch from 'node-fetch';

interface ErrorResponse {
  message?: string;
  error?: { message?: string };
}

export type ResolveTrackOptions = {
  url: string,
};

export interface TrackResource {
  id: number;
  duration: number;
  permalink: string;
  title: string;
  uri: string;
  permalink_url: string;
  artwork_url: string | null;
  waveform_url: string;
  user: {
    id: number,
    permalink: string,
    username: string,
    uri: string,
    permalink_url: string,
    avatar_url: string,
  };
  /** Streaming endpoint from the V1 API.  */
  stream_url?: string;
  download_url?: string;
  /** Token for streaming URLs from the V2 API.  */
  track_authorization?: string;
  /** Descriptions of the streaming URLs from the V2 API. */
  media?: {
    transcodings: {
      url: string,
      duration: number,
      format: {
        protocol: string,
        mime_type: string,
      },
    }[],
  };
}

export type GetTrackOptions = {
  track_id: string,
  /** Only for the V1 API. */
  secret_token?: string,
};

export type GetTracksOptions = {
  ids: string,
};

export type SearchOptions = {
  q: string,
  offset: number,
  limit: number,
};

export interface SoundCloudClient {
  search(options: SearchOptions): Promise<TrackResource[]>;
  resolveTrack(options: ResolveTrackOptions): Promise<TrackResource | null>;
  getTrack(options: GetTrackOptions): Promise<TrackResource | null>;
  getTracks(options: GetTracksOptions): Promise<TrackResource[]>;
}

type QueryParams = Record<string, string | number | undefined | null>;

/**
 * A small SoundCloud API client.
 */
export class SoundCloudV1Client implements SoundCloudClient {
  #params: QueryParams;
  #baseUrl: string;

  // TODO: take a `key` and `secret` option and do this:
  // https://developers.soundcloud.com/docs/api/guide#client-creds
  // Can't test that atm because obtaining a key/secret is impossible.
  constructor(params: QueryParams) {
    this.#params = params;
    this.#baseUrl = 'https://api.soundcloud.com';
  }

  async #get<T>(resource: string, options: QueryParams) {
    const url = new URL(resource, this.#baseUrl);
    for (const [key, value] of Object.entries({ ...this.#params, ...options })) {
      if (value != null) {
        url.searchParams.append(key, value.toString());
      }
    }
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });
    const data = (await response.json()) as T & ErrorResponse;
    if (!response.ok) {
      throw new Error(data.error?.message ?? data.message);
    }
    return data as T;
  }

  search(options: SearchOptions): Promise<TrackResource[]> {
    return this.#get('/tracks', options);
  }

  resolveTrack(options: ResolveTrackOptions): Promise<TrackResource | null> {
    return this.#get('/resolve', options);
  }

  getTrack({ track_id, secret_token }: GetTrackOptions): Promise<TrackResource | null> {
    return this.#get(`/track/${encodeURIComponent(track_id)}`, { secret_token });
  }

  getTracks(options: GetTracksOptions): Promise<TrackResource[]> {
    return this.#get('/tracks', options);
  }
}

export class SoundCloudV2Client implements SoundCloudClient {
  #baseUrl = 'https://api-v2.soundcloud.com/';
  #clientID: Promise<string>;
  #logger: import('pino').Logger;

  constructor({ logger }: { logger: import('pino').Logger }) {
    this.#logger = logger;
    this.#clientID = this.#determineClientID();
    // This rejection is expected, but is not handled immediately.
    this.#clientID.catch((err) => {
      this.#logger.warn({ err });
    });
  }

  // I don't want to do this but it is literally impossible to use the V1 API right now.
  // If SoundCloud starts issuing API keys again we'll get rid of this.
  async #determineClientID() {
    const url = 'https://soundcloud.com/discover';
    const homeResponse = await fetch(url);
    const homepage = await homeResponse.text();
    for (const match of homepage.matchAll(/<script(?:.*?)src="(.*?)"(?:.*?)><\/script>/g)) {
      const scriptResponse = await fetch(new URL(match[1], url));
      const js = await scriptResponse.text();
      const m = js.match(/client_id:"(.*?)"/);
      if (m?.[1]) {
        return m[1];
      }
    }
    throw new Error('Could not determine client ID');
  }

  #refreshClientID() {
    this.#clientID = this.#determineClientID();
    // This rejection is expected, but is not handled immediately.
    this.#clientID.catch((err) => {
      this.#logger.warn({ err });
    });
  }

  async #get<T>(resource: string, options: QueryParams, isRetry = false): Promise<T> {
    const clientID = await this.#clientID;
    const url = new URL(resource, this.#baseUrl);
    for (const [key, value] of Object.entries({ client_id: clientID, ...options })) {
      if (value != null) {
        url.searchParams.append(key, value);
      }
    }
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });

    if (response.status === 401) {
      if (isRetry) {
        throw new httpErrors.Unauthorized();
      }

      // Try to refresh the client ID.
      this.#refreshClientID();
      return this.#get(resource, options, true);
    }

    const data = (await response.json()) as T & ErrorResponse;
    if (!response.ok) {
      const Err = response.status in httpErrors
        ? httpErrors[response.status as (keyof typeof httpErrors & number)]
        : httpErrors.InternalServerError;
      throw new Err(data.error?.message ?? data.message);
    }

    return data as T;
  }

  async search(options: SearchOptions): Promise<TrackResource[]> {
    const { collection } = await this.#get<{ collection: TrackResource[] }>('/search/tracks', options);

    return collection;
  }

  resolveTrack(options: ResolveTrackOptions): Promise<TrackResource> {
    return this.#get('/resolve', { url: options.url });
  }

  getTrack({ track_id, secret_token }: GetTrackOptions): Promise<TrackResource | null> {
    return this.#get(`/tracks/soundcloud:tracks:${encodeURIComponent(track_id)}`, { secret_token });
  }

  getTracks(options: GetTracksOptions): Promise<TrackResource[]> {
    return this.#get('/tracks', { ids: options.ids });
  }

  async getStreamUrl(track: TrackResource): Promise<string | null> {
    const format = track.media?.transcodings.find((media) => media.format.protocol === 'progressive');
    if (!format) {
      return null;
    }

    const { url } = await this.#get<{ url: string }>(format.url, {
      track_authorization: track.track_authorization,
    });
    return url;
  }
}
