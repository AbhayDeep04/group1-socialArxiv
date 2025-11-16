// We must import this to get the extra matchers like .toBeInTheDocument()
import '@testing-library/jest-dom';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page'; // Import the component we want to test

// --- Mocks ---
// We must mock next/navigation because it's a Next.js hook
const mockRouterPush = jest.fn(); // Create a mock function for router.push()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush, // Use the mock function here
  }),
}));

// --- Mocking 'firebase/auth' ---
// 1. Import the real function we want to mock
import { signInWithEmailAndPassword } from 'firebase/auth';

// 2. Mock the 'firebase/auth' module
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})), // Return a dummy auth object
  // Tell Jest to create a mock function for signInWithEmailAndPassword
  signInWithEmailAndPassword: jest.fn(), 
}));

// 3. Mock the firebaseConfig (it's imported by the login page)
jest.mock('@/lib/firebaseConfig', () => ({
  auth: jest.fn(), // This is the mock function being passed
  db: jest.fn(),
}));

// 4. Cast the imported function as a Jest Mock
const mockedSignIn = signInWithEmailAndPassword as jest.Mock;
// --- End Mocks ---


// 'describe' groups related tests together
describe('Login Page (Use Case 1)', () => {

  // Reset all mocks before each test
  beforeEach(() => {
    mockRouterPush.mockClear();
    mockedSignIn.mockClear(); // Clear the new mock variable
    
    // Silence console.error for expected error tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    // Restore console.error after each test
    (console.error as jest.Mock).mockRestore();
  });


  // Test Case: TC-LOGIN-01 (Happy Path)
  it('should log in a user and redirect on success (TC-LOGIN-01)', async () => {
    // 1. Setup Mock
    mockedSignIn.mockResolvedValue({
      user: { uid: 'test-uid-456', email: 'test1@gmail.com' }
    });
    
    // 2. Initialization
    render(<LoginPage />);

    // 3. Test Steps
    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const form = screen.getByRole('button', { name: /Login/i }).closest('form')!;

    fireEvent.change(emailInput, { target: { value: 'test1@gmail.com' } });
    fireEvent.change(passwordInput, { target: { value: 'correctpassword' } });

    // 4. Test Step: Submit the form directly
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      expect(mockedSignIn).toHaveBeenCalledWith(
        expect.any(Function), 
        'test1@gmail.com',
        'correctpassword'
      );
      expect(mockRouterPush).toHaveBeenCalledWith('/');
    });
  });


  // Test Case: TC-LOGIN-02 (Incorrect Password)
  it('should display an error message on failed login (TC-LOGIN-02)', async () => {
    // 1. Setup Mock
    mockedSignIn.mockRejectedValue({
      code: 'auth/invalid-credential',
    });

    // 2. Initialization
    render(<LoginPage />);

    // 3. Test Steps
    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const form = screen.getByRole('button', { name: /Login/i }).closest('form')!;

    fireEvent.change(emailInput, { target: { value: 'test1@gmail.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });

    // 4. Test Step: Submit the form directly
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      expect(screen.getByText('Invalid email or password. Please try again.')).toBeInTheDocument();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  
  // Test Case: TS-2.3 (User Not Found)
  it('should show "Invalid" error when user is not found (TS-2.3)', async () => {
    // 1. Setup Mock
    mockedSignIn.mockRejectedValue({
      code: 'auth/user-not-found',
    });
    
    // 2. Initialization
    render(<LoginPage />);

    // 3. Test Steps
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not_a_user@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    const form = screen.getByRole('button', { name: /Login/i }).closest('form')!;
    
    // 4. Test Step: Submit the form directly
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      expect(screen.getByText('Invalid email or password. Please try again.')).toBeInTheDocument();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  
  // Test Case: TS-2.4 (Invalid Email Format)
  it('should show "Login failed" error for invalid email format (TS-2.4)', async () => {
    // 1. Setup Mock
    mockedSignIn.mockRejectedValue({
      code: 'auth/invalid-email',
    });
    
    // 2. Initialization
    render(<LoginPage />);

    // 3. Test Steps
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    const form = screen.getByRole('button', { name: /Login/i }).closest('form')!;
    
    // 4. Test Step: Submit the form directly
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      // --- THIS IS THE FIX ---
      // The DOM shows "Login failed..." for this error code.
      expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument();
      // --- END FIX ---
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  
  // Test Case: TS-2.5 (Empty Email)
  it('should show "Login failed" error for empty email (TS-2.5)', async () => {
    // 1. Setup Mock
    mockedSignIn.mockRejectedValue({
      code: 'auth/missing-email',
    });
    
    // 2. Initialization
    render(<LoginPage />);

    // 3. Test Steps
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    const form = screen.getByRole('button', { name: /Login/i }).closest('form')!;
    
    // 4. Test Step: Submit the form directly
    fireEvent.submit(form);

    // 5. Expected Results
    await waitFor(() => {
      // --- THIS IS THE FIX ---
      // The DOM shows "Login failed..." for this error code as well.
      expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument();
      // --- END FIX ---
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

});