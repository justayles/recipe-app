import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';
import { Alert, Platform } from 'react-native';

export type PhotoSource = 'camera' | 'library';

type ChoosePhotoOptions = {
  title: string;
  message: string;
  cameraLabel?: string;
  libraryLabel?: string;
};

const photoPickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  quality: 0.8,
  legacy: false,
  defaultTab: 'photos',
};

export function choosePhotoSource({
  title,
  message,
  cameraLabel = 'Take photo',
  libraryLabel = 'Photo library',
}: ChoosePhotoOptions): Promise<PhotoSource | null> {
  if (Platform.OS === 'web') return Promise.resolve('library');
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: libraryLabel, onPress: () => resolve('library') },
      { text: cameraLabel, onPress: () => resolve('camera') },
    ]);
  });
}

function canceled(): ImagePicker.ImagePickerCanceledResult {
  return { canceled: true, assets: null };
}

function fromUri(uri: string): ImagePicker.ImagePickerSuccessResult {
  return {
    canceled: false,
    assets: [{ uri, width: 0, height: 0 }],
  };
}

async function launchAndroidGallery(): Promise<ImagePicker.ImagePickerResult> {
  // ACTION_PICK + MediaStore images opens Gallery/Photos. ImagePicker's Photo Picker
  // and legacy GET_CONTENT both fall through to DocumentsUI (Drive) on many Androids.
  const result = await IntentLauncher.startActivityAsync('android.intent.action.PICK', {
    data: 'content://media/external/images/media',
    type: 'image/*',
  });
  if (result.resultCode !== IntentLauncher.ResultCode.Success || !result.data) {
    return canceled();
  }
  return fromUri(result.data);
}

export async function launchPhotoPicker(
  source: PhotoSource,
  extra?: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult> {
  const options: ImagePicker.ImagePickerOptions = {
    ...photoPickerOptions,
    ...extra,
    mediaTypes: ['images'],
    legacy: false,
  };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera access is needed to take a photo.');
    }
    return ImagePicker.launchCameraAsync(options);
  }
  if (Platform.OS === 'android') {
    try {
      return await launchAndroidGallery();
    } catch {
      // No gallery handler; last resort is the system picker.
    }
  }
  return ImagePicker.launchImageLibraryAsync(options);
}
