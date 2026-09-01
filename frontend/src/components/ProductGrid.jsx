import ProductCard from './ProductCard';

export default function ProductGrid({ products, emptyMessage = 'No products found.' }) {
  if (!products || products.length === 0) {
    return (
      <div className="border border-line border-dashed rounded-xl py-16 text-center">
        <p className="text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
