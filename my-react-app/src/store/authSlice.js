import { createSlice } from "@reduxjs/toolkit";

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user:  null,
    token: null,
  },
  reducers: {
    loginSuccess(state, action) {
      state.user  = action.payload.user;
      state.token = action.payload.token;
      localStorage.setItem("user",  JSON.stringify(action.payload.user));
      localStorage.setItem("token", action.payload.token);
    },
    updateUser(state, action) {
      state.user = action.payload;
      localStorage.setItem("user", JSON.stringify(action.payload));
    },
    logout(state) {
      state.user  = null;
      state.token = null;
      localStorage.removeItem("user");
      localStorage.removeItem("token");
    },
  },
});

export const { loginSuccess, updateUser, logout } = authSlice.actions;
export default authSlice.reducer;