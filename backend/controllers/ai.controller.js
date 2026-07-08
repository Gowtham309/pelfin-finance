import { parseNLInput, generateCoachResponse, getSpendingForecast } from '../services/ai.service.js';

export const parseNL = async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Text input is required.' });
    }

    const parsedData = await parseNLInput(text);
    res.status(200).json({ success: true, data: parsedData });
  } catch (err) {
    next(err);
  }
};

export const chatCoach = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    const result = await generateCoachResponse(userId, message, history || []);
    res.status(200).json({
      success: true,
      text: result.text,
      fallbackActive: result.fallbackActive
    });
  } catch (err) {
    next(err);
  }
};

export const forecast = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const forecastData = await getSpendingForecast(userId);
    res.status(200).json({ success: true, data: forecastData });
  } catch (err) {
    next(err);
  }
};
