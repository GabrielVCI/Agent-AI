/**
 * Forma canónica de un email de usuario: sin espacios y en minúsculas.
 *
 * La unique de `User.email` en PostgreSQL distingue mayúsculas, así que TODA
 * ruta que guarde o busque un usuario por email debe pasar por aquí. Si una
 * ruta guarda "Juan@X.com" y otra busca "juan@x.com", el usuario no puede
 * recuperar su contraseña y el mismo buzón puede registrarse dos veces
 * (falla F4).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
