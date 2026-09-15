# Secret production

Buat folder `secrets` di server (bukan `secrets.example`) dan isi lima file berikut,
masing-masing hanya dengan satu nilai tanpa tanda kutip:

- `cloudflare_tunnel_token.txt`
- `restic_password.txt`
- `backup_access_key_id.txt`
- `backup_secret_access_key.txt`
- `initial_admin_password.txt` (hanya dipakai saat membuat user pertama)

Atur permission agar hanya administrator server yang dapat membacanya. Folder
`secrets/` sudah diabaikan Git dan tidak boleh dikirim ke repository.
