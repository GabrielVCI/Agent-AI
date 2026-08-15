import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react'
import { Package, Tags, Plus, Search, Pencil, Power, Trash2, Wrench } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  catalogApi,
  CatalogCategory,
  CatalogItem,
  CatalogItemInput,
  CatalogItemType,
} from '../services/catalogApi'
import PaginationBar from '../components/ui/PaginationBar'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

const formatDOP = (value: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value)

type Tab = 'items' | 'categories'

// ─── Formulario de ítem ───────────────────────────────────────────────────────

interface ItemFormState {
  name: string
  type: CatalogItemType
  categoryId: string
  description: string
  price: string
  taxRate: string
  priceIncludesTax: boolean
  quantity: string
  sku: string
  isActive: boolean
}

const emptyItemForm: ItemFormState = {
  name: '',
  type: 'PRODUCT',
  categoryId: '',
  description: '',
  price: '',
  taxRate: '18',
  priceIncludesTax: false,
  quantity: '0',
  sku: '',
  isActive: true,
}

function itemToForm(item: CatalogItem): ItemFormState {
  return {
    name: item.name,
    type: item.type,
    categoryId: item.categoryId ?? '',
    description: item.description ?? '',
    price: String(item.price),
    taxRate: String(item.taxRate),
    priceIncludesTax: item.priceIncludesTax,
    quantity: item.quantity === null ? '' : String(item.quantity),
    sku: item.sku ?? '',
    isActive: item.isActive,
  }
}

function ItemFormModal({
  open,
  onClose,
  onSaved,
  categories,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  categories: CatalogCategory[]
  editing: CatalogItem | null
}) {
  const [form, setForm] = useState<ItemFormState>(emptyItemForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(editing ? itemToForm(editing) : emptyItemForm)
      setError('')
    }
  }, [open, editing])

  const set = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const isService = form.type === 'SERVICE'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const price = Number(form.price)
    const taxRate = Number(form.taxRate)
    if (Number.isNaN(price) || price < 0) {
      setError('Precio inválido')
      return
    }
    if (Number.isNaN(taxRate) || taxRate < 0 || taxRate > 99) {
      setError('ITBIS inválido (0 a 99%)')
      return
    }

    const payload: CatalogItemInput = {
      name: form.name.trim(),
      type: form.type,
      categoryId: form.categoryId || null,
      description: form.description.trim() || null,
      price,
      taxRate,
      priceIncludesTax: form.priceIncludesTax,
      quantity: isService ? null : Number(form.quantity || 0),
      sku: form.sku.trim() || null,
      isActive: form.isActive,
    }

    setSaving(true)
    try {
      if (editing) {
        await catalogApi.updateItem(editing.id, payload)
      } else {
        await catalogApi.createItem(payload)
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo guardar el ítem')
    } finally {
      setSaving(false)
    }
  }

  const activeCategories = categories.filter(c => c.isActive || c.id === form.categoryId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar ítem' : 'Nuevo producto o servicio'}
      size="lg"
    >
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            required
            minLength={2}
            placeholder="Ej: Pintura blanca 1 galón"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo</label>
            <select
              value={form.type}
              onChange={e => set('type', e.target.value as CatalogItemType)}
              className={inputClass}
            >
              <option value="PRODUCT">Producto</option>
              <option value="SERVICE">Servicio</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
            <select
              value={form.categoryId}
              onChange={e => set('categoryId', e.target.value)}
              className={inputClass}
            >
              <option value="">Sin categoría</option>
              {activeCategories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={2}
            placeholder="Opcional — ayuda al agente IA a identificar el ítem"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio (RD$)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={e => set('price', e.target.value)}
              required
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">ITBIS (%)</label>
            <input
              type="number"
              min={0}
              max={99}
              step="0.01"
              value={form.taxRate}
              onChange={e => set('taxRate', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Cantidad {isService && <span className="text-slate-400">(N/A)</span>}
            </label>
            <input
              type="number"
              min={0}
              value={isService ? '' : form.quantity}
              onChange={e => set('quantity', e.target.value)}
              disabled={isService}
              placeholder={isService ? 'Servicio' : '0'}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              SKU <span className="text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.sku}
              onChange={e => set('sku', e.target.value)}
              placeholder="Ej: PIN-BLA-01"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col justify-end gap-2 pb-0.5">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.priceIncludesTax}
                onChange={e => set('priceIncludesTax', e.target.checked)}
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              El precio ya incluye ITBIS
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => set('isActive', e.target.checked)}
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Activo (visible para el agente IA)
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear ítem'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Formulario de categoría ─────────────────────────────────────────────────

function CategoryFormModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing: CatalogCategory | null
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setDescription(editing?.description ?? '')
      setError('')
    }
  }, [open, editing])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const data = { name: name.trim(), description: description.trim() || null }
      if (editing) {
        await catalogApi.updateCategory(editing.id, data)
      } else {
        await catalogApi.createCategory(data)
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo guardar la categoría')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar categoría' : 'Nueva categoría'}>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            minLength={2}
            placeholder="Ej: Pinturas"
            className={inputClass}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Opcional"
            className={inputClass}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [tab, setTab] = useState<Tab>('items')
  const [items, setItems] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Filtros de ítems — TODOS server-side (fase de listados): el backend
  // filtra y pagina; el frontend nunca filtra la página cargada.
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Paginación server-side. Cambiar cualquier filtro resetea page=1.
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  const withPageReset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }
  const setSearchF = withPageReset(setSearch)
  const setFilterCategoryF = withPageReset(setFilterCategory)
  const setFilterTypeF = withPageReset(setFilterType)
  const setFilterStatusF = withPageReset(setFilterStatus)

  // Modales
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'item'; target: CatalogItem } | { kind: 'category'; target: CatalogCategory } | null
  >(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const [itemsResult, categoriesData] = await Promise.all([
        catalogApi.listItems({
          search: search.trim() || undefined,
          categoryId: filterCategory || undefined,
          type: (filterType || undefined) as CatalogItem['type'] | undefined,
          status: (filterStatus || undefined) as 'active' | 'inactive' | undefined,
          page,
          limit,
        }),
        catalogApi.listCategories(),
      ])
      setItems(itemsResult.items)
      setTotal(itemsResult.total)
      setPages(itemsResult.pages)
      setCategories(categoriesData ?? [])
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo cargar el catálogo')
    } finally {
      setLoading(false)
    }
  }, [search, filterCategory, filterType, filterStatus, page, limit])

  useEffect(() => {
    // Debounce del search (300ms); el resto de filtros cargan de inmediato
    const t = window.setTimeout(load, search ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [load, search])

  // El backend ya filtró y paginó: la lista renderiza tal cual
  const filteredItems = items

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const toggleItem = async (item: CatalogItem) => {
    try {
      await catalogApi.setItemStatus(item.id, !item.isActive)
      flash(item.isActive ? 'Ítem desactivado' : 'Ítem activado')
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo cambiar el estado')
    }
  }

  const toggleCategory = async (category: CatalogCategory) => {
    try {
      await catalogApi.setCategoryStatus(category.id, !category.isActive)
      flash(category.isActive ? 'Categoría desactivada' : 'Categoría activada')
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo cambiar el estado')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    setError('')
    try {
      if (confirmDelete.kind === 'item') {
        await catalogApi.deleteItem(confirmDelete.target.id)
        flash('Ítem eliminado')
      } else {
        const result = await catalogApi.deleteCategory(confirmDelete.target.id)
        flash(result.deleted ? 'Categoría eliminada' : 'La categoría tenía ítems: se desactivó')
      }
      setConfirmDelete(null)
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo eliminar')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Catálogo</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Productos y servicios que tu agente IA puede consultar y cotizar
          </p>
        </div>
        {canManage && (
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              if (tab === 'items') {
                setEditingItem(null)
                setItemModalOpen(true)
              } else {
                setEditingCategory(null)
                setCategoryModalOpen(true)
              }
            }}
          >
            {tab === 'items' ? 'Nuevo ítem' : 'Nueva categoría'}
          </Button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            { id: 'items', label: 'Productos / Servicios', icon: <Package className="h-4 w-4" /> },
            { id: 'categories', label: 'Categorías', icon: <Tags className="h-4 w-4" /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]
        ).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <>
          {/* Barra compacta de filtros: 1 fila en desktop, 2 col en tablet, 1 col en mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_170px_170px_140px] gap-2">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearchF(e.target.value)}
                placeholder="Buscar por nombre, SKU o descripción…"
                className={`${inputClass} pl-9`}
              />
            </div>
            <select
              value={filterCategory}
              onChange={e => setFilterCategoryF(e.target.value)}
              className={inputClass}
              title="Categoría"
            >
              <option value="">Todas las categorías</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterTypeF(e.target.value)}
              className={inputClass}
              title="Tipo"
            >
              <option value="">Productos y servicios</option>
              <option value="PRODUCT">Solo productos</option>
              <option value="SERVICE">Solo servicios</option>
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatusF(e.target.value)}
              className={inputClass}
              title="Estado"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>

          <Card padding="none">
            {filteredItems.length === 0 ? (
              <EmptyState
                icon={<Package className="h-10 w-10" />}
                title={
                  search || filterCategory || filterType || filterStatus
                    ? 'No encontramos resultados con estos filtros'
                    : 'Tu catálogo está vacío'
                }
                description={
                  search || filterCategory || filterType || filterStatus
                    ? 'Prueba con otros términos o limpia los filtros.'
                    : 'Agrega productos o servicios para que tu agente IA pueda responder con precios y disponibilidad reales.'
                }
                action={
                  canManage && !search && !filterCategory && !filterType && !filterStatus ? (
                    <Button
                      icon={<Plus className="h-4 w-4" />}
                      onClick={() => {
                        setEditingItem(null)
                        setItemModalOpen(true)
                      }}
                    >
                      Agregar el primero
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Categoría</th>
                      <th className="px-4 py-3 font-medium text-right">Precio</th>
                      <th className="px-4 py-3 font-medium text-right">ITBIS</th>
                      <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      {canManage && <th className="px-4 py-3 font-medium text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{item.name}</p>
                          {item.sku && <p className="text-xs text-slate-400">SKU: {item.sku}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {item.type === 'SERVICE' ? (
                            <Badge variant="purple">
                              <Wrench className="h-3 w-3 mr-1" />
                              Servicio
                            </Badge>
                          ) : (
                            <Badge variant="info">
                              <Package className="h-3 w-3 mr-1" />
                              Producto
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {item.category?.name ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {formatDOP(item.price)}
                          {item.priceIncludesTax && (
                            <p className="text-xs font-normal text-slate-400">ITBIS incluido</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{item.taxRate}%</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {item.type === 'SERVICE' ? (
                            <span className="text-slate-300">N/A</span>
                          ) : (
                            <span className={item.quantity === 0 ? 'text-amber-600 font-medium' : ''}>
                              {item.quantity ?? 0}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={item.isActive ? 'success' : 'default'}>
                            {item.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                title="Editar"
                                onClick={() => {
                                  setEditingItem(item)
                                  setItemModalOpen(true)
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                title={item.isActive ? 'Desactivar' : 'Activar'}
                                onClick={() => toggleItem(item)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  item.isActive
                                    ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                    : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                                }`}
                              >
                                <Power className="h-4 w-4" />
                              </button>
                              <button
                                title="Eliminar"
                                onClick={() => setConfirmDelete({ kind: 'item', target: item })}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filteredItems.length > 0 && (
              <div className="px-4 pb-3">
                <PaginationBar
                  total={total}
                  page={page}
                  pages={pages}
                  limit={limit}
                  onPageChange={setPage}
                  onLimitChange={l => {
                    setLimit(l)
                    setPage(1)
                  }}
                  noun="ítems"
                />
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'categories' && (
        <Card padding="none">
          {categories.length === 0 ? (
            <EmptyState
              icon={<Tags className="h-10 w-10" />}
              title="Sin categorías"
              description="Crea categorías para organizar tu catálogo (ej: Pinturas, Herramientas, Consultas)."
              action={
                canManage ? (
                  <Button
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => {
                      setEditingCategory(null)
                      setCategoryModalOpen(true)
                    }}
                  >
                    Crear la primera
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Descripción</th>
                    <th className="px-4 py-3 font-medium text-right">Ítems</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    {canManage && <th className="px-4 py-3 font-medium text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map(category => (
                    <tr key={category.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{category.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {category.description ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{category.itemCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant={category.isActive ? 'success' : 'default'}>
                          {category.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title="Editar"
                              onClick={() => {
                                setEditingCategory(category)
                                setCategoryModalOpen(true)
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              title={category.isActive ? 'Desactivar' : 'Activar'}
                              onClick={() => toggleCategory(category)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                category.isActive
                                  ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                  : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                            >
                              <Power className="h-4 w-4" />
                            </button>
                            <button
                              title="Eliminar"
                              onClick={() =>
                                setConfirmDelete({ kind: 'category', target: category })
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modales */}
      <ItemFormModal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        onSaved={() => {
          flash(editingItem ? 'Ítem actualizado' : 'Ítem creado')
          load()
        }}
        categories={categories}
        editing={editingItem}
      />

      <CategoryFormModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onSaved={() => {
          flash(editingCategory ? 'Categoría actualizada' : 'Categoría creada')
          load()
        }}
        editing={editingCategory}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Confirmar eliminación"
        size="sm"
      >
        <p className="text-sm text-slate-600">
          {confirmDelete?.kind === 'item' ? (
            <>
              ¿Eliminar <strong>{confirmDelete.target.name}</strong>? Las cotizaciones existentes
              conservarán el nombre del ítem.
            </>
          ) : confirmDelete?.kind === 'category' ? (
            <>
              ¿Eliminar la categoría <strong>{confirmDelete.target.name}</strong>? Si tiene ítems
              asociados, solo se desactivará.
            </>
          ) : null}
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
