import React, { useState, useEffect } from "react";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import axios from "axios";
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Select,
  MenuItem,
  Button,
  Grid,
  IconButton,
  Snackbar,
  Alert
} from "@mui/material";
import { Edit, Delete } from "@mui/icons-material";
import Layout from "../components/Layout";
import { useNotifications } from "../context/notificationContext";
import { useAlarms } from "../context/alarmContext";
import * as plantService from "../services/plantService";

const PlantDashboard = () => {
  const [plants, setPlants] = useState([]);
  const [plantName, setPlantName] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Get notification refresh function to update notifications after adding a plant
  const { refreshData: refreshNotifications } = useNotifications();
  const { refreshData: refreshAlarms } = useAlarms();
  
  // API URL from environment variables
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  useEffect(() => {
    fetchPlants();
  }, []);

  const fetchPlants = async () => {
    try {
      const plants = await plantService.getPlants();
      setPlants(plants);
    } catch (err) {
      console.error("Error fetching plants:", err);
      setSnackbar({ 
        open: true, 
        message: 'Failed to fetch plants. Please try again.', 
        severity: 'error' 
      });
    }
  };

  const addPlant = async () => {
    try {
      // Validate inputs
      if (!plantName || !location || !capacity) {
        setSnackbar({ 
          open: true, 
          message: 'Please fill in all required fields', 
          severity: 'warning' 
        });
        return;
      }
      
      const newPlant = await plantService.addPlant({
        plantName,
        location,
        capacity: parseInt(capacity),
        isActive,
      });
      
      setPlants([...plants, newPlant]);
      clearForm();
      
      // Refresh notifications to show the new plant notification
      if (refreshNotifications) {
        console.log('Refreshing notifications after adding plant');
        refreshNotifications();
      }
      
      setSnackbar({ 
        open: true, 
        message: `New plant "${plantName}" has been added successfully!`, 
        severity: 'success' 
      });
      
    } catch (err) {
      console.error("Error adding plant:", err);
      setSnackbar({ 
        open: true, 
        message: 'Failed to add plant. Please try again.', 
        severity: 'error' 
      });
    }
  };

  const clearForm = () => {
    setPlantName("");
    setLocation("");
    setCapacity("");
    setIsActive(true);
    setEditMode(false);
    setSelectedPlant(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this plant?")) {
      try {
        await plantService.deletePlant(id);
        fetchPlants();
        setSnackbar({ 
          open: true, 
          message: 'Plant deleted successfully', 
          severity: 'success' 
        });
      } catch (err) {
        console.error("Error deleting plant:", err);
        setSnackbar({ 
          open: true, 
          message: 'Failed to delete plant. Please try again.', 
          severity: 'error' 
        });
      }
    }
  };

  const handleEdit = (plant) => {
    setEditMode(true);
    setSelectedPlant(plant);
    setPlantName(plant.plantName);
    setLocation(plant.location);
    setCapacity(plant.capacity);
    setIsActive(plant.isActive);
  };

  const updatePlant = async () => {
    try {
      // Validate inputs
      if (!plantName || !location || !capacity) {
        setSnackbar({ 
          open: true, 
          message: 'Please fill in all required fields', 
          severity: 'warning' 
        });
        return;
      }
      
      await plantService.updatePlant(selectedPlant._id, {
        plantName,
        location,
        capacity: parseInt(capacity),
        isActive,
      });
      
      fetchPlants();
      clearForm();
      
      setSnackbar({ 
        open: true, 
        message: 'Plant updated successfully', 
        severity: 'success' 
      });
    } catch (err) {
      console.error("Error updating plant:", err);
      setSnackbar({ 
        open: true, 
        message: 'Failed to update plant. Please try again.', 
        severity: 'error' 
      });
    }
  };

  // Handle closing the snackbar
  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };
  
  return (
    <>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Plant Dashboard
      </Typography>
      
      {/* Notification Snackbar */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Paper sx={{ p: 3, mb: 4, borderRadius: 3 }}>
        <Typography variant="h6" gutterBottom>
          {editMode ? "Edit Plant" : "Add New Plant"}
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Plant Name"
              value={plantName}
              onChange={(e) => setPlantName(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Capacity"
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Select
              fullWidth
              value={isActive}
              onChange={(e) =>
                setIsActive(e.target.value === "true" || e.target.value === true)
              }
            >
              <MenuItem value="true">Active</MenuItem>
              <MenuItem value="false">Inactive</MenuItem>
            </Select>
          </Grid>
          <Grid item xs={12} sm={6} md={1}>
            {editMode ? (
              <>
                <Button fullWidth variant="contained" onClick={updatePlant}>
                  Update
                </Button>
                <Button
                  fullWidth
                  variant="text"
                  onClick={clearForm}
                  sx={{ mt: 1 }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                fullWidth
                variant="contained"
                onClick={addPlant}
                sx={{ height: "100%" }}
              >
                Add
              </Button>
            )}
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ borderRadius: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#0d47a1" }}>
                <TableCell sx={{ color: "white", fontWeight: "bold" }}>Plant Name</TableCell>
                <TableCell sx={{ color: "white", fontWeight: "bold" }}>Location</TableCell>
                <TableCell sx={{ color: "white", fontWeight: "bold" }}>Capacity</TableCell>
                <TableCell sx={{ color: "white", fontWeight: "bold" }}>Status</TableCell>
                <TableCell sx={{ color: "white", fontWeight: "bold", textAlign: "center" }}>Edit</TableCell>
                <TableCell sx={{ color: "white", fontWeight: "bold", textAlign: "center" }}>Delete</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
  {plants.map((plant) => (
    <TableRow key={plant._id}>
      <TableCell>{plant.plantName}</TableCell>
      <TableCell>{plant.location}</TableCell>
      <TableCell>{plant.capacity}</TableCell>
      <TableCell>{plant.isActive ? "Active" : "Inactive"}</TableCell>
      <TableCell align="center">
        <Button onClick={() => handleEdit(plant)} color="primary">
          <EditIcon />
        </Button>
      </TableCell>
      <TableCell align="center">
        <Button onClick={() => handleDelete(plant._id)} color="error">
          <DeleteIcon />
        </Button>
      </TableCell>
    </TableRow>
  ))}
</TableBody>

          </Table>
        </TableContainer>
      </Paper>
    </>
  );
};

export default PlantDashboard;
