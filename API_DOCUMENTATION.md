# LMS API Documentation

## Authentication Routes
Base URL: `/api/auth`

### Login
- **URL**: `/login`
- **Method**: `POST`
- **Auth Required**: No
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response**:
  ```json
  {
    "token": "jwt_token_here",
    "user": {
      "id": "user_id",
      "name": "User Name",
      "email": "user@example.com",
      "roleId": "role_id"
    }
  }
  ```

### Google OAuth Login
- **URL**: `/google`
- **Method**: `GET`
- **Auth Required**: No
- **Description**: Redirects to Google OAuth page

### Google OAuth Callback
- **URL**: `/google/callback`
- **Method**: `GET`
- **Auth Required**: No
- **Description**: Callback URL for Google OAuth

### Get Current User
- **URL**: `/me`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "id": "user_id",
    "name": "User Name",
    "email": "user@example.com",
    "roleId": "role_id"
  }
  ```

### Get User Permissions
- **URL**: `/permissions`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "permissions": ["create_user", "view_user", "edit_user", "delete_user"]
  }
  ```

## User Routes
Base URL: `/api/users`

### Get All Users
- **URL**: `/`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  [
    {
      "id": "user_id",
      "name": "User Name",
      "email": "user@example.com",
      "roleId": "role_id"
    }
  ]
  ```

### Get User by ID
- **URL**: `/:id`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "id": "user_id",
    "name": "User Name",
    "email": "user@example.com",
    "roleId": "role_id"
  }
  ```

### Create User
- **URL**: `/`
- **Method**: `POST`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "name": "New User",
    "email": "newuser@example.com",
    "password": "password123",
    "roleId": "role_id"
  }
  ```
- **Response**:
  ```json
  {
    "id": "new_user_id",
    "name": "New User",
    "email": "newuser@example.com",
    "roleId": "role_id"
  }
  ```

### Update User
- **URL**: `/:id`
- **Method**: `PUT`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "name": "Updated User",
    "email": "updateduser@example.com",
    "roleId": "new_role_id"
  }
  ```
- **Response**:
  ```json
  {
    "id": "user_id",
    "name": "Updated User",
    "email": "updateduser@example.com",
    "roleId": "new_role_id"
  }
  ```


## Role Routes
Base URL: `/api/roles`

### Get All Roles
- **URL**: `/`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  [
    {
      "id": "role_id",
      "name": "Admin",
      "description": "Administrator role"
    }
  ]
  ```

### Get Role by ID
- **URL**: `/:id`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "id": "role_id",
    "name": "Admin",
    "description": "Administrator role"
  }
  ```

### Create Role
- **URL**: `/`
- **Method**: `POST`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "name": "Manager",
    "description": "Manager role"
  }
  ```
- **Response**:
  ```json
  {
    "id": "new_role_id",
    "name": "Manager",
    "description": "Manager role"
  }
  ```

### Update Role
- **URL**: `/:id`
- **Method**: `PUT`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "name": "Senior Manager",
    "description": "Senior Manager role"
  }
  ```
- **Response**:
  ```json
  {
    "id": "role_id",
    "name": "Senior Manager",
    "description": "Senior Manager role"
  }
  ```

### Delete Role
- **URL**: `/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "message": "Role deleted successfully"
  }
  ```

### Assign Permissions to Role
- **URL**: `/:id/permissions`
- **Method**: `POST`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "permissionIds": ["permission_id1", "permission_id2"]
  }
  ```
- **Response**:
  ```json
  {
    "message": "Permissions assigned successfully"
  }
  ```

## Department Routes
Base URL: `/api/departments`

### Get All Departments
- **URL**: `/`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  [
    {
      "id": "department_id",
      "name": "HR",
      "description": "Human Resources"
    }
  ]
  ```

### Get Department by ID
- **URL**: `/:id`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "id": "department_id",
    "name": "HR",
    "description": "Human Resources"
  }
  ```

### Create Department
- **URL**: `/`
- **Method**: `POST`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "name": "IT",
    "description": "Information Technology"
  }
  ```
- **Response**:
  ```json
  {
    "id": "new_department_id",
    "name": "IT",
    "description": "Information Technology"
  }
  ```

### Update Department
- **URL**: `/:id`
- **Method**: `PUT`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "name": "IT Support",
    "description": "IT Support Team"
  }
  ```
- **Response**:
  ```json
  {
    "id": "department_id",
    "name": "IT Support",
    "description": "IT Support Team"
  }
  ```

### Delete Department
- **URL**: `/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "message": "Department deleted successfully"
  }
  ```

## Employee Routes
Base URL: `/api/employees`

### Get All Employees
- **URL**: `/`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  [
    {
      "id": "employee_id",
      "userId": "user_id",
      "departmentId": "department_id",
      "position": "Software Engineer",
      "employeeNumber": "EMP001",
      "joiningDate": "2023-01-15"
    }
  ]
  ```

### Get Employee by ID
- **URL**: `/:id`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "id": "employee_id",
    "userId": "user_id",
    "departmentId": "department_id",
    "position": "Software Engineer",
    "employeeNumber": "EMP001",
    "joiningDate": "2023-01-15",
    "user": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "department": {
      "name": "IT"
    }
  }
  ```

### Create Employee
- **URL**: `/`
- **Method**: `POST`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "userId": "user_id",
    "departmentId": "department_id",
    "position": "Software Engineer",
    "employeeNumber": "EMP001",
    "joiningDate": "2023-01-15",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    },
    "contact": {
      "phone": "123-456-7890",
      "alternateEmail": "john.personal@example.com"
    },
    "emergencyContact": {
      "name": "Jane Doe",
      "relationship": "Spouse",
      "phone": "987-654-3210"
    }
  }
  ```
- **Response**:
  ```json
  {
    "id": "new_employee_id",
    "userId": "user_id",
    "departmentId": "department_id",
    "position": "Software Engineer",
    "employeeNumber": "EMP001",
    "joiningDate": "2023-01-15"
  }
  ```

### Update Employee
- **URL**: `/:id`
- **Method**: `PUT`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Body**:
  ```json
  {
    "departmentId": "new_department_id",
    "position": "Senior Software Engineer"
  }
  ```
- **Response**:
  ```json
  {
    "id": "employee_id",
    "userId": "user_id",
    "departmentId": "new_department_id",
    "position": "Senior Software Engineer",
    "employeeNumber": "EMP001",
    "joiningDate": "2023-01-15"
  }
  ```

### Delete Employee
- **URL**: `/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes (JWT Token)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "message": "Employee deleted successfully"
  }
  ```



## Admin Routes
Base URL: `/api/admin`

### Dashboard Statistics
- **URL**: `/dashboard`
- **Method**: `GET`
- **Auth Required**: Yes (JWT Token + Admin Role)
- **Headers**:
  ```
  Authorization: Bearer jwt_token_here
  ```
- **Response**:
  ```json
  {
    "totalEmployees": 50,
    "totalDepartments": 5
  }
  ```

### Initialize Leave Allocations
- **URL**: `/initialize-allocations`
- **Method**: `POST`
