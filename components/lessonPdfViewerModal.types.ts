export type LessonPdfViewerModalProps = {
  visible: boolean;
  uri: string | null;
  title?: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  onClose: () => void;
  onLoadError: (message: string) => void;
};
