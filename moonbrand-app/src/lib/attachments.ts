import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import type { ChatAttachment } from '@moonbrand/shared/api/contract';

import { errorMessage } from './api';
import { chatApi } from './services';

// Le foto allegate a un messaggio: come nello studio, ridotte a un lato massimo e caricate subito nella cartella del brand;
// al messaggio vanno i loro percorsi.
const MAX_SIDE = 2048;
const MAX_PHOTOS = 10;

export interface PendingPhoto {
  key: string;
  localUri: string;
  uploaded: ChatAttachment | null;
  failed: boolean;
}

async function toDataUri(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SIDE) {
    context.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.86, base64: true });
  return `data:image/jpeg;base64,${result.base64}`;
}

export function useAttachments(brandId: string | undefined, onError: (message: string) => void) {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);

  const upload = useCallback(
    async (asset: ImagePicker.ImagePickerAsset, key: string) => {
      if (!brandId) return;
      try {
        const dataUri = await toDataUri(asset.uri, asset.width, asset.height);
        const uploaded = await chatApi.upload(brandId, dataUri);
        setPhotos((list) => list.map((photo) => (photo.key === key ? { ...photo, uploaded } : photo)));
      } catch (error) {
        setPhotos((list) => list.map((photo) => (photo.key === key ? { ...photo, failed: true } : photo)));
        onError(errorMessage(error, 'Non sono riuscito a caricare una foto.'));
      }
    },
    [brandId, onError],
  );

  const add = useCallback(
    async (source: 'library' | 'camera') => {
      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) {
        onError(`Al massimo ${MAX_PHOTOS} foto per messaggio.`);
        return;
      }
      const permission =
        source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        onError(source === 'camera' ? 'Serve il permesso della fotocamera.' : 'Serve il permesso per le foto.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: source === 'library', selectionLimit: room };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const added = result.assets.slice(0, room).map((asset, i) => ({ asset, key: `${Date.now()}-${i}` }));
      setPhotos((list) => [...list, ...added.map(({ asset, key }) => ({ key, localUri: asset.uri, uploaded: null, failed: false }))]);
      await Promise.all(added.map(({ asset, key }) => upload(asset, key)));
    },
    [photos.length, onError, upload],
  );

  const remove = useCallback((key: string) => setPhotos((list) => list.filter((photo) => photo.key !== key)), []);
  const clear = useCallback(() => setPhotos([]), []);

  const uploading = photos.some((photo) => !photo.uploaded && !photo.failed);
  const files = photos.flatMap((photo) => (photo.uploaded ? [photo.uploaded.file] : []));

  return { photos, add, remove, clear, uploading, files };
}
