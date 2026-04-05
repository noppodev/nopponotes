# NoppoNotes

## OAuth / Deep Link

- Android向けにカスタムスキーム `nopponotes://auth` を追加しました。OAuthプロバイダのリダイレクト先に `nopponotes://auth` を登録してください。
- 実装: `android/app/src/main/AndroidManifest.xml` に `intent-filter` を追加し、`src/services/authService.ts` はネイティブ環境で自動的に `nopponotes://auth` を使うようになっています。