import * as httpErrors from 'http-errors';
import fetch from 'node-fetch';

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
  stream_url: string;
  download_url: string;
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
  resolveTrack(options: ResolveTrackOptions): Promise<TrackResource>;
  getTracks(options: GetTracksOptions): Promise<TrackResource[]>;
}

/**
 * A small SoundCloud API client.
 */
export class SoundCloudV1Client implements SoundCloudClient {
  #params: Record<string, string>;
  #baseUrl: string;

  constructor(params: Record<string, string>) {
    this.#params = params;
    this.#baseUrl = 'https://api.soundcloud.com';
  }

  async #get(resource: string, options: Record<string, string>) {
    const url = new URL(resource, this.#baseUrl);
    for (const [key, value] of Object.entries({ ...this.#params, ...options })) {
      url.searchParams.append(key, value);
    }
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message ?? data.message);
    }
    return data;
  }

  search(options: SearchOptions) {
    return this.#get('/tracks', {
      q: options.q,
      offset: options.offset.toString(),
      limit: options.limit.toString(),
    });
  }

  resolveTrack(options: ResolveTrackOptions): Promise<TrackResource> {
    return this.#get('/resolve', options);
  }

  getTracks(options: GetTracksOptions): Promise<TrackResource[]> {
    return this.#get('/tracks', options);
  }
}

export class SoundCloudV2Client implements SoundCloudClient {
  #baseUrl = 'https://api-v2.soundcloud.com/'
  #clientID = this.#stealClientID()

  // I don't want to do this but it is literally impossible to use the V1 API right now.
  // If SoundCloud starts issuing API keys again we'll get rid of this.
  async #stealClientID() {
    const url = 'https://soundcloud.com/discover'
    const homeResponse = await fetch(url)
    const homepage = await homeResponse.text()
    for (const match of homepage.matchAll(/<script(?:.*?)src="(.*?)"(?:.*?)><\/script>/g)) {
      const scriptResponse = await fetch(new URL(match[1], url))
      const js = await scriptResponse.text()
      const m = js.match(/client_id:"(.*?)"/);
      if (m?.[1]) {
        return m[1];
      }
    }
    throw new Error('Could not determine client ID');
  }

  async #get<T>(resource: string, options: Record<string, string>, isRetry = false): Promise<T> {
    const clientID = await this.#clientID;
    const url = new URL(resource, this.#baseUrl);
    for (const [key, value] of Object.entries({ client_id: clientID, ...options })) {
      url.searchParams.append(key, value);
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
      this.#clientID = this.#stealClientID();
      return this.#get(resource, options, true);
    }

    const data = await response.json();
    if (!response.ok) {
      throw new httpErrors[response.status](data.error?.message ?? data.message);
    }

    return data;
  }

  async search(options: SearchOptions): Promise<TrackResource[]> {
    const { collection } = await this.#get('/search/tracks', {
      q: options.q,
      offset: `${options.offset}`,
      limit: `${options.limit}`,
    });

    return collection;
  }

  async resolveTrack(options: ResolveTrackOptions): Promise<TrackResource> {
    return this.#get('/resolve', { url: options.url });
  }

  async getTracks(options: GetTracksOptions): Promise<TrackResource[]> {
    return this.#get('/tracks', { ids: options.ids });
  }
}
