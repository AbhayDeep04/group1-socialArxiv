// We must import this to get the extra matchers like .toBeInTheDocument()
import '@testing-library/jest-dom';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from './page'; // Import the component we want to test

// --- Mocks ---
// We must mock next/navigation
const mockRouterPush = jest.fn(); // Mock function for router.push()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

// --- Mocking 'firebase/auth' (Robust Method) ---
// 1. Import the real function
import { createUserWithEmailAndPassword } from 'firebase/auth';

// 2. Mock the module
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  // Create a mock function for createUserWithEmailAndPassword
  createUserWithEmailAndPassword: jest.fn(),
}));

// 3. Mock the firebaseConfig (it's imported by the register page)
jest.mock('@/lib/firebaseConfig', () => ({
  auth: jest.fn(),
  db: jest.fn(),
}));

// 4. Mock the global 'fetch' function for our /api/auth/onSignUp call
global.fetch = jest.fn();

// 5. Cast the imported function as a Jest Mock
const mockedCreateUser = createUserWithEmailAndPassword as jest.Mock;
// --- End Mocks ---


// 'describe' groups related tests together
describe('Register Page (Use Case 1)', () => {

  // Before each test, reset all our mock functions
  beforeEach(() => {
    mockRouterPush.mockClear();
    mockedCreateUser.mockClear();
    (global.fetch as jest.Mock).mockClear();
    
    // Silence console.error for expected error tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    // Restore console.error after each test
    (console.error as jest.Mock).mockRestore();
  });


  // Test Case: TC-REG-01 (Happy Path)
  it('should register a new user and redirect on success (TC-REG-01)', async () => {
    // 1. Setup Mocks
    mockedCreateUser.mockResolvedValue({
      user: { uid: 'test-uid-123', email: 'newuser@test.com' }
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    // 2. Initialization
    render(<RegisterPage />);

    // 3. Test Steps
    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const form = screen.getByRole('button', { name: /Create an account/i }).closest('form')!;

    fireEvent.change(emailInput, { target: { value: 'newuser@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    // 4. Test Step: Submit the form
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      expect(mockedCreateUser).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/onSignUp', expect.any(Object));
      expect(mockRouterPush).toHaveBeenCalledWith('/');
    });
  });

  
  // Test Case: TC-REG-02 (Email Exists)
  it('should show an error if the email is already in use (TC-REG-02)', async () => {
    // 1. Setup Mock
    mockedCreateUser.mockRejectedValue({
      code: 'auth/email-already-in-use',
    });

    // 2. Initialization
    render(<RegisterPage />);

    // 3. Test Steps
    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const form = screen.getByRole('button', { name: /Create an account/i }).closest('form')!;

    fireEvent.change(emailInput, { target: { value: 'test1@gmail.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    // 4. Test Step: Submit the form
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      const errorMessage = screen.getByText('This email address is already registered.');
      expect(errorMessage).toBeInTheDocument();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  
  // Test Case: TS-1.3 (Weak Password)
  it('should show specific error for weak password (TS-1.3)', async () => {
    // 1. Setup Mock
    mockedCreateUser.mockRejectedValue({
      code: 'auth/weak-password',
    });

    // 2. Initialization
    render(<RegisterPage />);

    // 3. Test Steps
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'newuser@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: '123' } });
    const form = screen.getByRole('button', { name: /Create an account/i }).closest('form')!;
    
    // 4. Test Step: Submit
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      // --- THIS IS THE FIX ---
      // This is the correct message from your component's DOM
      expect(screen.getByText('Password should be at least 6 characters.')).toBeInTheDocument();
      // --- END FIX ---
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  
  // Test Case: TS-1.4 (Invalid Email)
  it('should show a generic error for invalid email (TS-1.4)', async () => {
    // 1. Setup Mock
    mockedCreateUser.mockRejectedValue({
      code: 'auth/invalid-email',
    });

    // 2. Initialization
    render(<RegisterPage />);

    // 3. Test Steps
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    const form = screen.getByRole('button', { name: /Create an account/i }).closest('form')!;

    // 4. Test Step: Submit
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      // --- THIS IS THE FIX ---
      // This is the correct message from your component's DOM
      expect(screen.getByText('Registration failed. Please try again.')).toBeInTheDocument();
      // --- END FIX ---
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  
  
  // Test Case: TS-1.5 & TS-1.6 (Empty fields)
  it('should show a generic error for other auth failures (TS-1.5, TS-1.6)', async () => {
    // 1. Setup Mock
    mockedCreateUser.mockRejectedValue({
      code: 'auth/missing-password', // Use one of the codes
    });

    // 2. Initialization
    render(<RegisterPage />);

    // 3. Test Steps
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'newuser@test.com' } });
    // Password left empty
    const form = screen.getByRole('button', { name: /Create an account/i }).closest('form')!;

    // 4. Test Step: Submit
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      // --- THIS IS THE FIX ---
      // This is the correct message from your component's DOM
      expect(screen.getByText('Registration failed. Please try again.')).toBeInTheDocument();
      // --- END FIX ---
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

});