// Sous-ensemble typé de l'API Bot Telegram — uniquement ce que le service consomme.
// Pas de SDK : l'API est du JSON simple, fetch natif suffit (philosophie du repo).

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  // Tout autre type d'update (channel_post, etc.) est ignoré par la matrice.
  [key: string]: unknown;
}

export interface TgChat {
  id: number;
  type: string;
}

export interface TgPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgVoice {
  file_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TgAudio {
  file_id: string;
  duration: number;
  mime_type?: string;
  file_name?: string;
  file_size?: number;
}

export interface TgVideo {
  file_id: string;
  duration: number;
  width: number;
  height: number;
  mime_type?: string;
  file_size?: number;
}

export interface TgVideoNote {
  file_id: string;
  duration: number;
  length: number;
  file_size?: number;
}

export interface TgDocument {
  file_id: string;
  mime_type?: string;
  file_name?: string;
  file_size?: number;
}

export interface TgMessage {
  message_id: number;
  /** Unix seconds. */
  date: number;
  chat: TgChat;
  text?: string;
  caption?: string;
  media_group_id?: string;
  photo?: TgPhotoSize[];
  voice?: TgVoice;
  audio?: TgAudio;
  video?: TgVideo;
  video_note?: TgVideoNote;
  document?: TgDocument;
  reply_to_message?: TgMessage;
  [key: string]: unknown;
}

export interface TgFile {
  file_id: string;
  file_size?: number;
  file_path?: string;
}
