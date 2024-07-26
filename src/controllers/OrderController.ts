import { Request, Response } from "express";
import Restaurant, { MenuItemType } from "../models/restaurant";
import Order from "../models/order";
import User from "../models/user";
import mongoose from "mongoose";

const FRONTEND_URL = process.env.FRONTEND_URL as string;

const getMyOrders = async (req: Request, res: Response) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .populate("restaurant")
      .populate("user");

    res.json(orders);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong" });
  }
};

type CheckoutSessionRequest = {
  cartItems: {
    menuItemId: string;
    name: string;
    quantity: string;
  }[];
  deliveryDetails: {
    email: string;
    name: string;
    addressLine1: string;
    city: string;
  };
  restaurantId: string;
};

const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    const checkoutSessionRequest: CheckoutSessionRequest = req.body;

    const restaurant = await Restaurant.findById(checkoutSessionRequest.restaurantId);
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    if (!restaurant.user) {
      throw new Error("Restaurant owner not found");
    }

    const newOrder = new Order({
      restaurant: restaurant._id,
      user: req.userId,
      status: "placed",
      deliveryDetails: checkoutSessionRequest.deliveryDetails,
      cartItems: checkoutSessionRequest.cartItems,
      createdAt: new Date(),
    });

    const lineItems = createLineItems(checkoutSessionRequest, restaurant.menuItems);

    // Save the new order
    await newOrder.save();

    // Update service points for the restaurant owner
    await updateUserServicePoints(restaurant.user.toString(), newOrder, restaurant.menuItems); // Pass menuItems as well

    // Assuming the frontend expects a URL, you could use a mock URL or skip this step
    const mockSuccessUrl = `${FRONTEND_URL}/order-status?success=true`;
    res.json({ url: mockSuccessUrl });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({ message: error.raw?.message || error.message });
  }
};

const createLineItems = (
  checkoutSessionRequest: CheckoutSessionRequest,
  menuItems: MenuItemType[]
) => {
  const lineItems = checkoutSessionRequest.cartItems.map((cartItem) => {
    const menuItem = menuItems.find(
      (item) => item._id.toString() === cartItem.menuItemId.toString()
    );

    if (!menuItem) {
      throw new Error(`Menu item not found: ${cartItem.menuItemId}`);
    }

    return {
      name: menuItem.name,
      quantity: parseInt(cartItem.quantity),
    };
  });

  return lineItems;
};

const updateUserServicePoints = async (userId: string, order: any, menuItems: MenuItemType[]) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Calculate service points based on foodWeight
  const pointsToAdd = order.cartItems.reduce((acc: number, cartItem: { menuItemId: string, quantity: string }) => {
    const menuItem = menuItems.find(item => item._id.toString() === cartItem.menuItemId);
    if (menuItem) {
      return acc + (menuItem.foodWeight * parseInt(cartItem.quantity));
    }
    return acc;
  }, 0);

  user.servicePoints = (user.servicePoints || 0) + pointsToAdd;

  await user.save();
};

export default {
  getMyOrders,
  createCheckoutSession,
};
