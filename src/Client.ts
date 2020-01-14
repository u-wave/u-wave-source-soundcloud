import { URL, URLSearchParams } from 'url';
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

/**
 * A small SoundCloud API client.
 */
export default class SoundCloudClient {
  private params: { [key: string]: string };
  private baseUrl: string;

  constructor(params: SoundCloudClient["params"]) {
    this.params = params;
    this.baseUrl = 'https://api.soundcloud.com';
  }

  async get(resource: string, options: SoundCloudClient["params"]) {
    const url = new URL(resource, this.baseUrl);
    for (const [key, value] of Object.entries({ ...this.params, ...options })) {
      url.searchParams.append(key, value);
    }
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error.message);
    }
    return data;
  }

  search(options: SearchOptions) {
    return this.get('/tracks', {
      q: options.q,
      offset: options.offset.toString(),
      limit: options.offset.toString(),
    });
  }

  resolveTrack(options: ResolveTrackOptions): Promise<TrackResource> {
    return this.get('/resolve', options);
  }

  getTracks(options: GetTracksOptions): Promise<TrackResource[]> {
    return this.get('/tracks', options);
  }
}
