#!/usr/bin/env bash
set -e

# Script de instalación para Android Studio, SDK Android 15, ADB y Galaxy Watch Studio
# Funciona en Pop!_OS (basado en Ubuntu)

EMOJI_CHECK='✅'
EMOJI_SKIP='⏭️'
EMOJI_BOLT='⚡'

# Determinar archivo de perfil
PROFILE="$HOME/.bashrc"
if [[ -n "$ZSH_VERSION" || -f "$HOME/.zshrc" ]]; then
  PROFILE="$HOME/.zshrc"
fi

function install_pkg() {
  local pkg="$1"
  if dpkg -s "$pkg" >/dev/null 2>&1; then
    echo "$EMOJI_SKIP Paquete $pkg ya instalado"
  else
    sudo apt-get install -y "$pkg"
  fi
}

# Actualizar repositorios
sudo apt-get update -y

# 1. Dependencias básicas para Android Studio y SDK
install_pkg wget
install_pkg curl
install_pkg unzip
install_pkg openjdk-17-jdk
install_pkg android-tools-adb
install_pkg libvirt-daemon-system
install_pkg libvirt-clients
install_pkg qemu-kvm

# 3. Librerías i386 necesarias
sudo dpkg --add-architecture i386
sudo apt-get update -y
install_pkg libc6:i386
install_pkg libncurses5:i386
install_pkg libstdc++6:i386
install_pkg lib32z1
install_pkg libbz2-1.0:i386

# 4. Descargar y extraer Android Studio
AS_VERSION="2024.1.1.12"
AS_URL="https://redirector.gvt1.com/edgedl/android/studio/ide-zips/${AS_VERSION}/android-studio-${AS_VERSION}-linux.tar.gz"
if [[ ! -d /opt/android-studio ]]; then
  echo "$EMOJI_BOLT Descargando Android Studio"
  wget -q "$AS_URL" -O /tmp/android-studio.tar.gz
  sudo mkdir -p /opt
  sudo tar -xzf /tmp/android-studio.tar.gz -C /opt
  sudo mv /opt/android-studio-* /opt/android-studio
  sudo chmod -R a=rx,u+w /opt/android-studio
  echo "$EMOJI_CHECK Android Studio instalado"
else
  echo "$EMOJI_SKIP Android Studio ya presente"
fi

# Instalar command-line tools y SDK Android 15
ANDROID_HOME="$HOME/Android/Sdk"
mkdir -p "$ANDROID_HOME"
if [[ ! -d "$ANDROID_HOME/cmdline-tools" ]]; then
  echo "$EMOJI_BOLT Descargando Command-line tools"
  wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdline-tools.zip
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  unzip -q /tmp/cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi

yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-35" >/tmp/sdk.log 2>&1
if [[ $? -eq 0 ]]; then
  echo "$EMOJI_CHECK SDK Android 15 instalado"
else
  echo "❌ Error instalando SDK Android 15. Revisa /tmp/sdk.log"
fi

# 5. Galaxy Watch Studio
GWS_URL="https://download-developer.samsung.com/sdk/WatchStudio/GalaxyWatchStudio_2.0.0_Ubuntu64.tar.gz"
if [[ ! -d /opt/galaxy-watch-studio ]]; then
  echo "$EMOJI_BOLT Descargando Galaxy Watch Studio"
  wget -q "$GWS_URL" -O /tmp/gws.tar.gz
  sudo tar -xzf /tmp/gws.tar.gz -C /opt
  sudo mv /opt/GalaxyWatchStudio* /opt/galaxy-watch-studio
  sudo chmod -R a+rwx /opt/galaxy-watch-studio
  echo "$EMOJI_CHECK Galaxy Watch Studio instalado"
else
  echo "$EMOJI_SKIP Galaxy Watch Studio ya presente"
fi

# 2. Configurar ADB y compatibilidad Samsung S25 Ultra
install_pkg adb
sudo usermod -aG plugdev "$USER"
if [[ ! -f /etc/udev/rules.d/51-android.rules ]]; then
  echo "$EMOJI_BOLT Configurando reglas udev para dispositivos Samsung"
  sudo bash -c 'echo "SUBSYSTEM==\"usb\", ATTR{idVendor}==\"04e8\", MODE=\"0666\", GROUP=\"plugdev\"" > /etc/udev/rules.d/51-android.rules'
  sudo udevadm control --reload-rules
  sudo udevadm trigger
fi
echo "$EMOJI_CHECK ADB configurado"

# 6. Variables de entorno
if ! grep -q ANDROID_HOME "$PROFILE"; then
  {
    echo ''
    echo '# Android SDK'
    echo "export ANDROID_HOME='$ANDROID_HOME'"
    echo 'export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"'
  } >> "$PROFILE"
  echo "$EMOJI_CHECK Variables de entorno añadidas a $PROFILE"
else
  echo "$EMOJI_SKIP Variables de entorno ya configuradas en $PROFILE"
fi

echo "🎉 Instalación completada. Reinicia la terminal para aplicar los cambios."
