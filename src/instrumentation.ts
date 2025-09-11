export async function register() {
  if (!process.env.BASE_URL) {
    throw new Error('BASE_URL is not defined');
  }
  if (!process.env.SECRET_KEY_BASE) {
    throw new Error('SECRET_KEY_BASE is not defined');
  }

  process.env.NEXTAUTH_SECRET = process.env.SECRET_KEY_BASE;
  process.env.NEXTAUTH_URL = process.env.BASE_URL;
}
