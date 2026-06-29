const salonOwnerRegistry = [
  {
    key: "business_name",
    label: "Business Name",
    path: "business_name",
    type: "string",
  },
  {
    key: "gst_number",
    label: "GST Number",
    path: "gst_number",
    type: "string",
  },
  { key: "status", label: "Status", path: "status", type: "string" },
  { key: "owner_name", label: "Owner Name", path: "user.name", type: "string" },
  {
    key: "owner_email",
    label: "Owner Email",
    path: "user.email",
    type: "string",
  },
  { key: "created_at", label: "Created At", path: "created_at", type: "date" },
  { key: "is_active", label: "Active", path: "is_active", type: "boolean" },
];

const salonApplicationRegistry = [
  {
    key: "salon_name",
    label: "Salon Name",
    path: "salon_name",
    type: "string",
  },
  { key: "phone", label: "Phone", path: "phone", type: "string" },
  {
    key: "application_type",
    label: "Request Type",
    path: "application_type",
    type: "string",
  },
  { key: "city", label: "City", path: "city", type: "string" },
  { key: "state", label: "State", path: "state", type: "string" },
  {
    key: "application_status",
    label: "Status",
    path: "application_status",
    type: "string",
  },
  {
    key: "owner_name",
    label: "Owner",
    path: "owner.user.name",
    type: "string",
  },
  { key: "created_at", label: "Submitted", path: "created_at", type: "date" },
];

const salonRegistry = [
  {
    key: "salon_name",
    label: "Salon Name",
    path: "salon_name",
    type: "string",
  },
  { key: "phone", label: "Phone", path: "phone", type: "string" },
  { key: "city", label: "City", path: "city", type: "string" },
  { key: "state", label: "State", path: "state", type: "string" },
  { key: "status", label: "Status", path: "status", type: "string" },
  {
    key: "is_featured",
    label: "Featured",
    path: "is_featured",
    type: "boolean",
  },
  {
    key: "owner_name",
    label: "Owner",
    path: "owner.user.name",
    type: "string",
  },
  { key: "created_at", label: "Created At", path: "created_at", type: "date" },
];

const serviceCategoryRegistry = [
  { key: "name", label: "Name", path: "name", type: "string" },
  {
    key: "sort_order",
    label: "Sort Order",
    path: "sort_order",
    type: "number",
  },
  { key: "status", label: "Status", path: "status", type: "string" },
  { key: "created_at", label: "Created At", path: "created_at", type: "date" },
];

const serviceRegistry = [
  {
    key: "service_name",
    label: "Service",
    path: "service_name",
    type: "string",
  },
  {
    key: "salon_name",
    label: "Salon",
    path: "salon.salon_name",
    type: "string",
  },
  {
    key: "category_name",
    label: "Category",
    path: "category.name",
    type: "string",
  },
  { key: "price", label: "Price", path: "price", type: "number" },
  {
    key: "discount_price",
    label: "Discount Price",
    path: "discount_price",
    type: "number",
  },
  {
    key: "duration_minutes",
    label: "Duration (min)",
    path: "duration_minutes",
    type: "number",
  },
  { key: "status", label: "Status", path: "status", type: "string" },
];

const customerRegistry = [
  { key: "customer_name", label: "Name", path: "user.name", type: "string" },
  { key: "email", label: "Email", path: "user.email", type: "string" },
  { key: "phone", label: "Phone", path: "user.phone", type: "string" },
  { key: "gender", label: "Gender", path: "gender", type: "string" },
  { key: "status", label: "Status", path: "status", type: "string" },
  { key: "created_at", label: "Joined", path: "created_at", type: "date" },
];

const bookingRegistry = [
  {
    key: "booking_number",
    label: "Booking #",
    path: "booking_number",
    type: "string",
  },
  {
    key: "customer_name",
    label: "Customer",
    path: "customer.user.name",
    type: "string",
  },
  {
    key: "salon_name",
    label: "Salon",
    path: "salon.salon_name",
    type: "string",
  },
  {
    key: "service_name",
    label: "Service",
    path: "service.service_name",
    type: "string",
  },
  { key: "booking_date", label: "Date", path: "booking_date", type: "date" },
  {
    key: "booking_status",
    label: "Status",
    path: "booking_status",
    type: "string",
  },
];

const reviewRegistry = [
  {
    key: "salon_name",
    label: "Salon",
    path: "salon.salon_name",
    type: "string",
  },
  {
    key: "customer_name",
    label: "Customer",
    path: "customer.user.name",
    type: "string",
  },
  { key: "rating", label: "Rating", path: "rating", type: "number" },
  { key: "review", label: "Review", path: "review", type: "string" },
  { key: "status", label: "Status", path: "status", type: "string" },
  { key: "created_at", label: "Created At", path: "created_at", type: "date" },
];

const couponRegistry = [
  { key: "code", label: "Code", path: "code", type: "string" },
  {
    key: "discount_type",
    label: "Type",
    path: "discount_type",
    type: "string",
  },
  {
    key: "discount_value",
    label: "Value",
    path: "discount_value",
    type: "number",
  },
  { key: "valid_from", label: "Valid From", path: "valid_from", type: "date" },
  { key: "valid_to", label: "Valid To", path: "valid_to", type: "date" },
  { key: "status", label: "Status", path: "status", type: "string" },
];

const bannerRegistry = [
  { key: "title", label: "Title", path: "title", type: "string" },
  {
    key: "redirect_type",
    label: "Redirect Type",
    path: "redirect_type",
    type: "string",
  },
  {
    key: "sort_order",
    label: "Sort Order",
    path: "sort_order",
    type: "number",
  },
  { key: "status", label: "Status", path: "status", type: "string" },
];

const auditLogRegistry = [
  { key: "action", label: "Action", path: "action", type: "string" },
  { key: "entity_type", label: "Entity", path: "entity_type", type: "string" },
  { key: "user_name", label: "User", path: "user.name", type: "string" },
  { key: "created_at", label: "When", path: "created_at", type: "date" },
];

const rolesRegistry = [
  { key: "name", label: "Name", path: "name", type: "string" },
  {
    key: "hierarchy_level",
    label: "Hierarchy",
    path: "hierarchy_level",
    type: "number",
  },
  { key: "is_active", label: "Active", path: "is_active", type: "boolean" },
  { key: "created_at", label: "Created At", path: "created_at", type: "date" },
];

function toRegistryMap(arr) {
  return Object.fromEntries(arr.map((c) => [c.key, c]));
}

module.exports = {
  salonOwnerRegistry,
  salonApplicationRegistry,
  salonRegistry,
  serviceCategoryRegistry,
  serviceRegistry,
  customerRegistry,
  bookingRegistry,
  reviewRegistry,
  couponRegistry,
  bannerRegistry,
  auditLogRegistry,
  rolesRegistry,
  salonOwnerRegistryByKey: toRegistryMap(salonOwnerRegistry),
  salonApplicationRegistryByKey: toRegistryMap(salonApplicationRegistry),
  salonRegistryByKey: toRegistryMap(salonRegistry),
  serviceCategoryRegistryByKey: toRegistryMap(serviceCategoryRegistry),
  serviceRegistryByKey: toRegistryMap(serviceRegistry),
  customerRegistryByKey: toRegistryMap(customerRegistry),
  bookingRegistryByKey: toRegistryMap(bookingRegistry),
  reviewRegistryByKey: toRegistryMap(reviewRegistry),
  couponRegistryByKey: toRegistryMap(couponRegistry),
  bannerRegistryByKey: toRegistryMap(bannerRegistry),
  auditLogRegistryByKey: toRegistryMap(auditLogRegistry),
  rolesRegistryByKey: toRegistryMap(rolesRegistry),
  registryByKey: toRegistryMap([...salonRegistry]),
};

//console.log('UAT deploy test');
