import frameUrl from '@/assets/images/system/drawing-frame.jpg';

export interface ImageAsset {
  /** File path used as stable ID */
  id: string;
  /** Filename without extension */
  name: string;
  /** Resolved asset URL */
  url: string;
}

export const imageAssets: ImageAsset[] = [{
  id: 'drawing-frame',
  name: '图纸图框',
  url: frameUrl,
}];
