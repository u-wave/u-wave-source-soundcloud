import getArtistTitle = require('get-artist-title');
import { SoundCloudClient, TrackResource, SoundCloudV1Client, SoundCloudV2Client } from './Client';

type SourceContext = unknown;

const PAGE_SIZE = 50;

export interface UwMedia {
  sourceID: string;
  artist: string;
  title: string;
  duration: number;
  thumbnail?: string;
  sourceData: {
    fullTitle: string,
    permalinkUrl: string,
    streamUrl?: string,
    artistUrl: string,
    username: string,
  };
};
type PlayData = {
  streamUrl: string,
};

function enlargeThumbnail(thumbnail: string): string | undefined {
  // Use larger thumbnail images:
  // -large is 100x100, -crop is 400x400.
  return thumbnail ? thumbnail.replace('-large.', '-crop.') : undefined;
}

function getThumbnailUrl(item: TrackResource): string | undefined {
  const thumbnail = item.artwork_url ?? item.user?.avatar_url;

  return enlargeThumbnail(thumbnail);
}

function normalizeMedia(media: TrackResource): UwMedia {
  const [artist, title] = getArtistTitle(media.title, {
    defaultArtist: media.user.username,
  })!;

  const sourceData = {
    fullTitle: media.title,
    permalinkUrl: media.permalink_url,
    streamUrl: media.stream_url,
    artistUrl: media.user.permalink_url,
    username: media.user.username,
  };
  return {
    sourceID: `${media.id}`,
    sourceData,
    artist,
    title,
    duration: Math.round(media.duration / 1000),
    thumbnail: getThumbnailUrl(media),
  };
}

export type SoundCloudOptions = {
  key: string,
};

const schema = {
  title: 'SoundCloud',
  'uw:key': 'source:soundcloud',
  properties: {
    key: {
      type: 'string',
      title: 'SoundCloud API Key',
      description: "If you don't have an API key, the source should still work, but may be a little less stable.",
    },
  },
};

function sortSourceIDsAndURLs(list: string[]): { urls: string[], sourceIDs: string[] } {
  const urls: string[] = [];
  const sourceIDs: string[] = [];
  list.forEach((item) => {
    if (/^https?:/.test(item)) {
      urls.push(item);
    } else {
      sourceIDs.push(item);
    }
  });
  return { urls, sourceIDs };
}

export default class SoundCloudSource {
  static sourceName = 'soundcloud';

  static schema = schema;

  static api = 3;

  #options: { key?: string };

  #client: SoundCloudClient;

  constructor(opts: { key?: string }) {
    this.#options = opts;
    this.#client = this.#options?.key
      ? new SoundCloudV1Client({ client_id: this.#options.key })
      : new SoundCloudV2Client();
  }

  async #resolve(url: string) {
    const body = await this.#client.resolveTrack({ url });
    return body ? normalizeMedia(body) : null;
  }

  async get(context: SourceContext, sourceIDsAndURLs: string[]): Promise<UwMedia[]> {
    const { urls, sourceIDs } = sortSourceIDsAndURLs(sourceIDsAndURLs);

    // Use the `/resolve` endpoint when items are added by their URL.
    const urlsPromise = Promise.all(urls.map((url) => this.#resolve(url)));
    const sourceIDsPromise = this.#client.getTracks({ ids: sourceIDs.join(',') });

    const [urlItems, sourceIDItems] = await Promise.all([urlsPromise, sourceIDsPromise]);

    // Ensure the results order is the same as the sourceIDs parameter order.
    // TODO deal with nonexistant source IDs
    const items: Record<string, UwMedia> = {};
    urls.forEach((url, index) => {
      const item = urlItems[index];
      if (item) {
        items[url] = item;
      }
    });
    sourceIDItems.forEach((sound) => {
      const item = normalizeMedia(sound);
      items[item.sourceID] = item;
    });
    return sourceIDsAndURLs
      .map((input) => items[input])
      .filter((item) => item != null);
  }

  async search(context: SourceContext, query: string, offset = 0): Promise<UwMedia[]> {
    if (/^https?:\/\/(api\.)?soundcloud\.com\//.test(query)) {
      const track = await this.#resolve(query);
      return track ? [track] : [];
    }

    const results = await this.#client.search({
      offset,
      q: query,
      limit: PAGE_SIZE,
    });

    return results.map(normalizeMedia);
  }

  async play(context: SourceContext, entry: UwMedia): Promise<PlayData | null> {
    const track = await this.#client.getTrack({ track_id: entry.sourceID });
    if (!track) {
      return null;
    }

    let streamUrl = track.stream_url ?? null;
    if (this.#client instanceof SoundCloudV2Client) {
      streamUrl = await this.#client.getStreamUrl(track);
    }

    if (!streamUrl) {
      return null;
    }

    return { streamUrl };
  }
}
