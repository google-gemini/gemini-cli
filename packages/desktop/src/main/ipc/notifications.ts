import { ipcMain, Notification } from 'electron';

export function setupNotificationHandlers(): void {
  // Show a native macOS notification
  ipcMain.on('notifications:show', (_event, title: string, body: string) => {
    if (!Notification.isSupported()) {
      console.warn('Notifications are not supported on this system');
      return;
    }

    const notification = new Notification({
      title,
      body,
      silent: false,
    });

    notification.show();
  });

  // Show notification with action buttons (macOS)
  ipcMain.handle(
    'notifications:show-with-actions',
    async (_event, options: { title: string; body: string; actions?: string[] }) => {
      if (!Notification.isSupported()) {
        return { clicked: false };
      }

      return new Promise((resolve) => {
        const notification = new Notification({
          title: options.title,
          body: options.body,
          actions: options.actions?.map((label) => ({ type: 'button' as const, text: label })),
        });

        notification.on('click', () => {
          resolve({ clicked: true, action: null });
        });

        notification.on('action', (_event, index) => {
          resolve({ clicked: true, action: options.actions?.[index] });
        });

        notification.on('close', () => {
          resolve({ clicked: false, action: null });
        });

        notification.show();
      });
    }
  );
}
