interface DocumentPictureInPicture {
  readonly window: Window | null;
}

interface Window {
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}
