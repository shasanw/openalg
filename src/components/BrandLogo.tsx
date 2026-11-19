export function BrandLogo() {
  return (
    <span className="block w-36 shrink-0">
      <img src="/branding/horizontal.svg" alt="OpenAlg" className="block w-full dark:hidden" />
      <img src="/branding/horizontal-dark.svg" alt="OpenAlg" className="hidden w-full dark:block" />
    </span>
  );
}
