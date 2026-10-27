export function maskEmail(email: string | null, reveal: boolean): string {
  if (!email) return "—";
  if (reveal) return email;
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 1)}•••@${domain}`;
}

export function maskPhone(phone: string | null, reveal: boolean): string {
  if (!phone) return "—";
  if (reveal) return phone;
  if (phone.length < 6) return "•••";
  return `${phone.slice(0, 4)}•••${phone.slice(-2)}`;
}
