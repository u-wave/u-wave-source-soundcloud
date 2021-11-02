import getArtistTitle = require('get-artist-title');
import { SoundCloudClient, TrackResource, SoundCloudV1Client, SoundCloudV2Client } from './Client';

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

export default function soundCloudSource(_: unknown, opts: SoundCloudOptions) {
  const client: SoundCloudClient = opts?.key
    ? new SoundCloudV1Client({ client_id: opts.key })
    : new SoundCloudV2Client()

  async function resolve(url: string) {
    const body = await client.resolveTrack({ url });
    return normalizeMedia(body);
  }

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

  async function get(sourceIDsAndURLs: string[]): Promise<UwMedia[]> {
    const { urls, sourceIDs } = sortSourceIDsAndURLs(sourceIDsAndURLs);

    // Use the `/resolve` endpoint when items are added by their URL.
    const urlsPromise = Promise.all(urls.map(resolve));
    const sourceIDsPromise = client.getTracks({ ids: sourceIDs.join(',') });

    const [urlItems, sourceIDItems] = await Promise.all([urlsPromise, sourceIDsPromise]);

    // Ensure the results order is the same as the sourceIDs parameter order.
    // TODO deal with nonexistant source IDs
    const items: Record<string, UwMedia> = {};
    urls.forEach((url, index) => {
      const item = urlItems[index];
      items[url] = item;
    });
    sourceIDItems.forEach((sound) => {
      const item = normalizeMedia(sound);
      items[item.sourceID] = item;
    });
    return sourceIDsAndURLs.map((input) => items[input]);
  }

  async function search(query: string, offset = 0): Promise<UwMedia[]> {
    if (/^https?:\/\/(api\.)?soundcloud\.com\//.test(query)) {
      const track = await resolve(query);
      return [track];
    }

    const results = await client.search({
      offset,
      q: query,
      limit: PAGE_SIZE,
    });

    return results.map(normalizeMedia);
  }

  return {
    name: 'soundcloud',
    search,
    get,
  };
}
